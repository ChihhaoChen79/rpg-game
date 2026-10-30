// Dev-server endpoints for the map editor (only active under `npm run editor`):
//   GET  /__editor/maps          -> [{ id, nameKey }]
//   GET  /__editor/map?id=<id>   -> maps/<id>.json
//   POST /__editor/save          -> writes maps, map names, spawn rows; runs `npm run tuning`
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { csvObjects, toCsv } from '../csv.mjs';
import { SHEETS } from '../tuning-lib.mjs';

export interface SaveRequest {
  maps: Record<string, unknown>; // id -> Tiled JSON
  names: Record<string, string>; // strings key -> text (map names)
  spawnMaps: string[]; // maps whose rows in tuning/spawns.csv are replaced by `spawns`
  spawns: Record<string, string | number>[]; // spawns.csv rows
}

const ID = /^[a-z][a-z0-9_]*$/;

function body(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let s = '';
    req.on('data', (c) => { s += c; });
    req.on('end', () => ok(s));
    req.on('error', fail);
  });
}

/** Adds or replaces keys in the strings file without reformatting it (new map names go after the last "map." key). */
function updateStrings(root: string, names: Record<string, string>): void {
  const path = resolve(root, 'data/strings.zh-TW.json');
  let text = readFileSync(path, 'utf8');
  for (const [key, value] of Object.entries(names)) {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`("${esc}": )"(?:[^"\\\\]|\\\\.)*"`);
    if (re.test(text)) text = text.replace(re, (_m, head: string) => `${head}${JSON.stringify(value)}`);
    else {
      const all = [...text.matchAll(/\n {2}"map\.[^"]*": "(?:[^"\\]|\\.)*",/g)];
      const last = all[all.length - 1];
      if (!last) throw new Error(`can't place new string ${key}`);
      const at = last.index! + last[0].length;
      text = `${text.slice(0, at)}\n  ${JSON.stringify(key)}: ${JSON.stringify(value)},${text.slice(at)}`;
    }
  }
  JSON.parse(text);
  writeFileSync(path, text);
}

export function editorApi(root: string): Plugin {
  return {
    name: 'map-editor-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '', 'http://x');
        const send = (code: number, data: unknown) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };
        try {
          if (url.pathname === '/__editor/maps') {
            const ids = readdirSync(resolve(root, 'maps')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
            return send(200, ids);
          }
          if (url.pathname === '/__editor/map') {
            const id = url.searchParams.get('id') ?? '';
            if (!ID.test(id)) return send(400, { error: 'bad id' });
            return send(200, JSON.parse(readFileSync(resolve(root, `maps/${id}.json`), 'utf8')));
          }
          if (url.pathname === '/__editor/save' && req.method === 'POST') {
            const r = JSON.parse(await body(req)) as SaveRequest;
            for (const id of [...Object.keys(r.maps), ...r.spawnMaps]) if (!ID.test(id)) return send(400, { error: `bad map id "${id}"` });
            for (const [id, map] of Object.entries(r.maps)) writeFileSync(resolve(root, `maps/${id}.json`), JSON.stringify(map));
            updateStrings(root, r.names);
            const csvPath = resolve(root, 'tuning/spawns.csv');
            const old = readFileSync(csvPath, 'utf8');
            const rows = (csvObjects(old) as unknown as Record<string, string>[]).filter((row) => !r.spawnMaps.includes(row.map!));
            const csv = toCsv(SHEETS.spawns, [...rows, ...r.spawns]);
            // Keep the file's own line endings so the diff shows only real changes.
            writeFileSync(csvPath, old.includes('\r\n') ? csv : csv.replace(/\r\n/g, '\n'));
            // Regenerate everything derived from the sheets (spawn numbers in maps, catalog...).
            execFile(process.execPath, ['tools/tuning.mjs', 'import'], { cwd: root }, (err, stdout, stderr) => {
              send(err ? 500 : 200, { ok: !err, output: `${stdout}${stderr}` });
            });
            return;
          }
        } catch (e) {
          return send(500, { error: e instanceof Error ? e.message : String(e) });
        }
        next();
      });
    },
  };
}
