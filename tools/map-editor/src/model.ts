// The editor's working copy of a map, and conversion to / from the Tiled JSON the game loads.
import { TILE_SIZE, tilesetJson } from '../../tileset-def.mjs';
import type { TiledMap } from '../../../src/logic/map';

export const EMPTY = -1;
export type ObjKind = 'exit' | 'spawn' | 'npc' | 'start' | 'respawn' | 'arrival';

/** A map object in tiles. Properties use the same names as in Tiled (see docs/MAPS.md). */
export interface EdObject {
  kind: ObjKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  props: Record<string, string | number>;
}

export interface EdMap {
  id: string;
  width: number;
  height: number;
  ground: Int16Array; // tile index (0-based) or EMPTY
  deco: Int16Array;
  collision: Int16Array; // any tile = blocked (hidden layer)
  safe: Int16Array; // any tile = safe zone (hidden layer)
  objects: EdObject[];
  props: { nameKey: string; respawnMap: string; levelRange: string };
}

export function blankMap(id: string, width: number, height: number, fill: number): EdMap {
  const n = width * height;
  return {
    id, width, height,
    ground: new Int16Array(n).fill(fill), deco: new Int16Array(n).fill(EMPTY),
    collision: new Int16Array(n).fill(EMPTY), safe: new Int16Array(n).fill(EMPTY),
    objects: [], props: { nameKey: `map.${id}`, respawnMap: 'village', levelRange: '' },
  };
}

const prop = (name: string, value: string | number | boolean) => ({
  name, type: typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : typeof value === 'boolean' ? 'bool' : 'string', value,
});

export function toTiled(m: EdMap): TiledMap {
  const layer = (id: number, name: string, a: Int16Array, visible = true) => ({
    data: Array.from(a, (t) => (t === EMPTY ? 0 : t + 1)), height: m.height, width: m.width, id, name, opacity: 1, type: 'tilelayer', visible, x: 0, y: 0,
  });
  const T = TILE_SIZE;
  const objects = m.objects.map((o, i) => {
    const point = o.kind === 'npc' || o.kind === 'start' || o.kind === 'respawn' || o.kind === 'arrival';
    return {
      id: i + 1, name: o.name, type: o.kind, rotation: 0, visible: true,
      ...(point
        ? { point: true, x: (o.x + 0.5) * T, y: (o.y + 0.5) * T, width: 0, height: 0 }
        : { x: o.x * T, y: o.y * T, width: o.w * T, height: o.h * T }),
      ...(Object.keys(o.props).length ? { properties: Object.entries(o.props).map(([k, v]) => prop(k, v)) } : {}),
    };
  });
  const props = [prop('nameKey', m.props.nameKey), prop('respawnMap', m.props.respawnMap)];
  if (m.props.levelRange) props.push(prop('levelRange', m.props.levelRange));
  return {
    compressionlevel: -1, width: m.width, height: m.height, infinite: false, orientation: 'orthogonal', renderorder: 'right-down',
    tiledversion: '1.10.2', tilewidth: T, tileheight: T, type: 'map', version: '1.10', nextlayerid: 6, nextobjectid: objects.length + 1,
    properties: props,
    layers: [
      layer(1, 'ground', m.ground), layer(2, 'deco', m.deco), layer(3, 'collision', m.collision, false), layer(4, 'safe', m.safe, false),
      { draworder: 'topdown', id: 5, name: 'objects', objects, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
    ],
    tilesets: [tilesetJson()],
  } as unknown as TiledMap;
}

interface RawLayer { type: string; name: string; data?: number[]; objects?: RawObject[] }
interface RawObject { name?: string; type?: string; class?: string; x: number; y: number; width?: number; height?: number; properties?: { name: string; value: string | number }[] }

export function fromTiled(id: string, raw: TiledMap): EdMap {
  const r = raw as unknown as { width: number; height: number; tilewidth: number; layers: RawLayer[]; properties?: { name: string; value: string }[] };
  const m = blankMap(id, r.width, r.height, EMPTY);
  const T = r.tilewidth;
  for (const l of r.layers) {
    if (l.type === 'tilelayer' && l.data) {
      const target = ({ ground: m.ground, deco: m.deco, collision: m.collision, safe: m.safe } as Record<string, Int16Array>)[l.name];
      if (target) l.data.forEach((gid, i) => { target[i] = gid ? (gid & 0x1fffffff) - 1 : EMPTY; });
    } else if (l.type === 'objectgroup') {
      for (const o of l.objects ?? []) {
        const kind = (o.type || o.class) as ObjKind;
        const point = !o.width && !o.height;
        m.objects.push({
          kind, name: o.name ?? '',
          x: Math.floor(o.x / T), y: Math.floor(o.y / T),
          w: point ? 1 : Math.max(1, Math.round((o.width ?? 0) / T)), h: point ? 1 : Math.max(1, Math.round((o.height ?? 0) / T)),
          props: Object.fromEntries((o.properties ?? []).map((p) => [p.name, p.value])),
        });
      }
    }
  }
  const get = (n: string) => r.properties?.find((p) => p.name === n)?.value;
  m.props = { nameKey: String(get('nameKey') ?? `map.${id}`), respawnMap: String(get('respawnMap') ?? 'village'), levelRange: String(get('levelRange') ?? '') };
  return m;
}
