// Converts a Tiled JSON map (plain object, already loaded by the caller) into MapData.
// Layer conventions are documented in tools/gen-maps.mjs and docs/MAPS.md.
import type { Exit, MapData, Vec } from './types';

// --- Minimal Tiled JSON shapes (only the fields we read) ---
interface TiledProperty {
  name: string;
  type?: string;
  value: unknown;
}
interface TiledTileLayer {
  type: 'tilelayer';
  name: string;
  data: number[];
}
interface TiledObject {
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: TiledProperty[];
}
interface TiledObjectLayer {
  type: 'objectgroup';
  name: string;
  objects: TiledObject[];
}
interface TiledTileset {
  firstgid: number;
  tiles?: { id: number; properties?: TiledProperty[] }[];
}
export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  properties?: TiledProperty[];
  layers: { type: string; name: string }[];
  tilesets: TiledTileset[];
}

const GID_MASK = 0x1fffffff; // strips Tiled flip flags

function prop(props: TiledProperty[] | undefined, name: string): unknown {
  return props?.find((p) => p.name === name)?.value;
}

function blockedGids(map: TiledMap): Set<number> {
  const out = new Set<number>();
  for (const ts of map.tilesets) {
    for (const t of ts.tiles ?? []) {
      if (prop(t.properties, 'blocked') === true) out.add(ts.firstgid + t.id);
    }
  }
  return out;
}

export function parseTiledMap(id: string, map: TiledMap): MapData {
  const w = map.width;
  const h = map.height;
  const blocked = new Uint8Array(w * h);
  const safe = new Uint8Array(w * h);
  const blockGids = blockedGids(map);
  const exits: Exit[] = [];
  let start: Vec | null = null;
  let respawn: Vec | null = null;

  for (const layer of map.layers) {
    if (layer.type === 'tilelayer') {
      const data = (layer as TiledTileLayer).data;
      for (let i = 0; i < w * h; i++) {
        const gid = (data[i] ?? 0) & GID_MASK;
        if (gid === 0) continue;
        if (layer.name === 'collision') blocked[i] = 1;
        else if (layer.name === 'safe') safe[i] = 1;
        else if (blockGids.has(gid)) blocked[i] = 1;
      }
    } else if (layer.type === 'objectgroup') {
      for (const o of (layer as TiledObjectLayer).objects) {
        const kind = o.type || o.class;
        const tx = Math.floor(o.x / map.tilewidth);
        const ty = Math.floor(o.y / map.tileheight);
        if (kind === 'start') start = { x: tx, y: ty };
        else if (kind === 'respawn') respawn = { x: tx, y: ty };
        else if (kind === 'exit') {
          exits.push({
            x: tx,
            y: ty,
            w: Math.max(1, Math.round((o.width ?? 0) / map.tilewidth)),
            h: Math.max(1, Math.round((o.height ?? 0) / map.tileheight)),
            targetMap: String(prop(o.properties, 'targetMap')),
            targetX: Number(prop(o.properties, 'targetX')),
            targetY: Number(prop(o.properties, 'targetY')),
          });
        }
      }
    }
  }

  return {
    id,
    nameKey: String(prop(map.properties, 'nameKey') ?? id),
    width: w,
    height: h,
    blocked,
    safe,
    exits,
    start,
    respawn,
  };
}

export function inBounds(m: MapData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.width && y < m.height;
}

export function isWalkable(m: MapData, x: number, y: number): boolean {
  return inBounds(m, x, y) && m.blocked[y * m.width + x] === 0;
}

export function isSafe(m: MapData, x: number, y: number): boolean {
  return inBounds(m, x, y) && m.safe[y * m.width + x] === 1;
}

export function exitAt(m: MapData, x: number, y: number): Exit | null {
  for (const e of m.exits) {
    if (x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h) return e;
  }
  return null;
}
