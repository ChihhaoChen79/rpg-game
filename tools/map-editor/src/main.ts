// Map editor (docs/PLAN.md §11.1, tools/map-editor/README.md). A developer tool: generate a map
// from a preset, place exits / spawn areas / NPCs / arrival points, touch up tiles, check, save.
import npcsData from '../../../data/npcs.json';
import stringsData from '../../../data/strings.zh-TW.json';
import { CONTENT } from '../../../src/content';
import { parseTiledMap, type TiledMap } from '../../../src/logic/map';
import { checkMap } from '../../../src/logic/mapcheck';
import type { MapData } from '../../../src/logic/types';
import { TILE, TILE_COUNT, TILESET_COLUMNS, TILESET_MARGIN, TILESET_SPACING } from '../../tileset-def.mjs';
import { DEFAULTS, generate, PRESETS, walkable, type GenOptions, type Preset } from './generators';
import { blankMap, EMPTY, fromTiled, toTiled, type EdMap, type EdObject, type ObjKind } from './model';

type Layer = 'ground' | 'deco' | 'collision' | 'safe';
type Tool = 'select' | 'paint' | 'erase' | 'fill' | 'rect' | ObjKind;

const strings = stringsData as Record<string, string>;
const monsters = CONTENT.monsters;
const npcIds = Object.keys(npcsData);
const T = 32; // tile size in the tileset image
const LAST_KEY = 'rpg-editor:last';

// ---------------------------------------------------------------- state

const st = {
  map: blankMap('newmap', 40, 30, TILE.GRASS) as EdMap,
  nameZh: '新地圖',
  isNew: true,
  others: {} as Record<string, EdMap>, // every other map (for exits, checks)
  changedOthers: new Set<string>(), // other maps changed by "create the way back"
  gen: { ...DEFAULTS } as GenOptions,
  tool: 'select' as Tool,
  layer: 'deco' as Layer,
  tile: TILE.TREE as number,
  zoom: 16,
  sel: -1, // selected object index
  undo: [] as string[],
  drag: null as null | { x0: number; y0: number; x1: number; y1: number; moving?: { dx: number; dy: number } },
  hover: null as null | { x: number; y: number },
};

const tileset = new Image();
tileset.src = '/assets/tilesets/placeholder.png';
const sprites: Record<string, HTMLImageElement> = {};
function spriteOf(monsterId: string): HTMLImageElement | null {
  const m = monsters[monsterId];
  if (!m) return null;
  if (!sprites[m.sprite]) {
    sprites[m.sprite] = new Image();
    sprites[m.sprite]!.src = `/assets/sprites/monsters/${m.sprite}.png`;
    sprites[m.sprite]!.onload = draw;
  }
  return sprites[m.sprite]!;
}

// ---------------------------------------------------------------- tiny DOM helpers

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  el.append(...kids);
  return el;
}
const field = (text: string, input: HTMLElement) => h('label', {}, h('span', {}, text), input);
const num = (value: number, onchange: (v: number) => void, min = 0, max = 999) =>
  h('input', { type: 'number', value, min, max, onchange: (e: Event) => onchange(Number((e.target as HTMLInputElement).value)) });
function select(options: [string, string][], value: string, onchange: (v: string) => void): HTMLSelectElement {
  const s = h('select', { onchange: () => onchange(s.value) }, ...options.map(([v, t]) => h('option', { value: v }, t)));
  s.value = value;
  return s;
}
function status(text: string, cls = ''): void {
  const el = document.getElementById('status')!;
  el.className = cls;
  el.textContent = text;
}
const mapName = (id: string) => (id === st.map.id ? st.nameZh : strings[st.others[id]?.props.nameKey ?? ''] ?? id);
const monsterLabel = (id: string) => {
  const m = monsters[id];
  return m ? `${m.boss ? '👑 ' : ''}${strings[m.nameKey] ?? id} Lv${m.level}` : id;
};

// ---------------------------------------------------------------- undo

function snapshot(): void {
  const m = st.map;
  st.undo.push(JSON.stringify({ g: [...m.ground], d: [...m.deco], c: [...m.collision], s: [...m.safe], o: m.objects, w: m.width, h: m.height }));
  if (st.undo.length > 60) st.undo.shift();
}
function undo(): void {
  const s = st.undo.pop();
  if (!s) return;
  const u = JSON.parse(s) as { g: number[]; d: number[]; c: number[]; s: number[]; o: EdObject[]; w: number; h: number };
  Object.assign(st.map, { width: u.w, height: u.h, ground: Int16Array.from(u.g), deco: Int16Array.from(u.d), collision: Int16Array.from(u.c), safe: Int16Array.from(u.s), objects: u.o });
  st.sel = -1;
  renderAll();
}

// ---------------------------------------------------------------- drawing

const canvas = document.getElementById('map') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const OBJ_COLORS: Record<ObjKind, string> = { exit: '#40e070', spawn: '#ffd040', npc: '#ff80ff', start: '#80c0ff', respawn: '#80ffff', arrival: '#ff9040' };
const OBJ_LETTER: Record<ObjKind, string> = { exit: '出', spawn: '怪', npc: '人', start: 'S', respawn: 'R', arrival: '傳' };

function drawTile(c: CanvasRenderingContext2D, t: number, x: number, y: number, size: number): void {
  if (t < 0 || !tileset.complete) return;
  const sx = TILESET_MARGIN + (t % TILESET_COLUMNS) * (T + TILESET_SPACING);
  const sy = TILESET_MARGIN + Math.floor(t / TILESET_COLUMNS) * (T + TILESET_SPACING);
  c.drawImage(tileset, sx, sy, T, T, x, y, size, size);
}

function drawMapInto(c: CanvasRenderingContext2D, m: EdMap, z: number, objects = true): void {
  c.imageSmoothingEnabled = false;
  c.fillStyle = '#000';
  c.fillRect(0, 0, m.width * z, m.height * z);
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const i = y * m.width + x;
    drawTile(c, m.ground[i]!, x * z, y * z, z);
    drawTile(c, m.deco[i]!, x * z, y * z, z);
    if (m.safe[i] !== EMPTY) { c.fillStyle = 'rgba(60,140,255,0.18)'; c.fillRect(x * z, y * z, z, z); }
    if (m.collision[i] !== EMPTY) { c.fillStyle = 'rgba(255,50,50,0.35)'; c.fillRect(x * z, y * z, z, z); }
  }
  if (!objects) return;
  m.objects.forEach((o, i) => {
    c.strokeStyle = OBJ_COLORS[o.kind];
    c.lineWidth = i === st.sel && m === st.map ? 3 : 1.5;
    c.fillStyle = `${OBJ_COLORS[o.kind]}33`;
    c.fillRect(o.x * z, o.y * z, o.w * z, o.h * z);
    c.strokeRect(o.x * z + 0.5, o.y * z + 0.5, o.w * z - 1, o.h * z - 1);
    if (o.kind === 'spawn') {
      const img = spriteOf(String(o.props.monster));
      const f = monsters[String(o.props.monster)]?.frame ?? 64;
      if (img?.complete) c.drawImage(img, 0, 0, f, f, o.x * z, o.y * z, Math.min(o.w, 3) * z, Math.min(o.w, 3) * z);
    }
    c.fillStyle = OBJ_COLORS[o.kind];
    c.font = `bold ${Math.max(10, z * 0.7)}px sans-serif`;
    c.fillText(OBJ_LETTER[o.kind], o.x * z + 2, o.y * z + Math.max(10, z * 0.7));
    if (z >= 12) {
      c.font = '11px sans-serif';
      const label = o.kind === 'exit' ? `→ ${mapName(String(o.props.targetMap ?? '?'))}` : o.kind === 'spawn' ? `${monsterLabel(String(o.props.monster))} ×${o.props.count}` : o.kind === 'npc' ? String(o.props.npcId) : o.name;
      c.fillStyle = '#000';
      c.fillText(label, o.x * z + 3, (o.y + o.h) * z + 12);
      c.fillStyle = OBJ_COLORS[o.kind];
      c.fillText(label, o.x * z + 2, (o.y + o.h) * z + 11);
    }
  });
}

function draw(): void {
  const m = st.map;
  const z = st.zoom;
  canvas.width = m.width * z;
  canvas.height = m.height * z;
  drawMapInto(ctx, m, z);
  if (z >= 16) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= m.width; x++) { ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, m.height * z); }
    for (let y = 0; y <= m.height; y++) { ctx.moveTo(0, y * z + 0.5); ctx.lineTo(m.width * z, y * z + 0.5); }
    ctx.stroke();
  }
  const d = st.drag;
  if (d && !d.moving && (st.tool === 'rect' || st.tool === 'exit' || st.tool === 'spawn')) {
    const r = rectOf(d);
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(r.x * z + 0.5, r.y * z + 0.5, r.w * z - 1, r.h * z - 1);
    ctx.setLineDash([]);
  }
  if (st.hover) {
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 1;
    ctx.strokeRect(st.hover.x * z + 0.5, st.hover.y * z + 0.5, z - 1, z - 1);
  }
}
tileset.onload = () => {
  draw();
  renderSide();
};

// ---------------------------------------------------------------- canvas input

const rectOf = (d: { x0: number; y0: number; x1: number; y1: number }) =>
  ({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0) + 1, h: Math.abs(d.y1 - d.y0) + 1 });
const inside = (o: EdObject, x: number, y: number) => x >= o.x && y >= o.y && x < o.x + o.w && y < o.y + o.h;

function tileAt(e: MouseEvent): { x: number; y: number } | null {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / st.zoom);
  const y = Math.floor((e.clientY - r.top) / st.zoom);
  return x >= 0 && y >= 0 && x < st.map.width && y < st.map.height ? { x, y } : null;
}

function layerArray(m: EdMap, l: Layer): Int16Array {
  return m[l];
}

function paintAt(x: number, y: number): void {
  const m = st.map;
  const a = layerArray(m, st.layer);
  const i = y * m.width + x;
  if (st.tool === 'erase') a[i] = st.layer === 'ground' ? TILE.GRASS : EMPTY;
  else a[i] = st.layer === 'collision' ? TILE.BLOCK_MARK : st.layer === 'safe' ? TILE.SAFE_MARK : st.tile;
}

function floodFill(x: number, y: number): void {
  const m = st.map;
  const a = layerArray(m, st.layer);
  const from = a[y * m.width + x]!;
  const to = st.layer === 'collision' ? TILE.BLOCK_MARK : st.layer === 'safe' ? TILE.SAFE_MARK : st.tile;
  if (from === to) return;
  const stack = [y * m.width + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (a[i] !== from) continue;
    a[i] = to;
    const cx = i % m.width;
    const cy = (i / m.width) | 0;
    if (cx > 0) stack.push(i - 1);
    if (cx < m.width - 1) stack.push(i + 1);
    if (cy > 0) stack.push(i - m.width);
    if (cy < m.height - 1) stack.push(i + m.width);
  }
}

canvas.addEventListener('mousedown', (e) => {
  const p = tileAt(e);
  if (!p) return;
  const m = st.map;
  const tool = st.tool;
  if (tool === 'select') {
    const i = [...m.objects].reverse().findIndex((o) => inside(o, p.x, p.y));
    st.sel = i < 0 ? -1 : m.objects.length - 1 - i;
    if (st.sel >= 0) {
      snapshot();
      const o = m.objects[st.sel]!;
      st.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, moving: { dx: p.x - o.x, dy: p.y - o.y } };
    }
    renderAll();
    return;
  }
  snapshot();
  if (tool === 'paint' || tool === 'erase') paintAt(p.x, p.y);
  else if (tool === 'fill') floodFill(p.x, p.y);
  else if (tool === 'npc' || tool === 'start' || tool === 'respawn' || tool === 'arrival') {
    if (tool === 'start' || tool === 'respawn') m.objects = m.objects.filter((o) => o.kind !== tool); // only one of each
    const n = m.objects.filter((o) => o.kind === tool).length + 1;
    m.objects.push({
      kind: tool, x: p.x, y: p.y, w: 1, h: 1,
      name: tool === 'arrival' ? `${m.id}_${n}` : tool === 'npc' ? npcIds[0]! : tool,
      props: tool === 'npc' ? { npcId: npcIds[0]! } : {},
    });
    st.sel = m.objects.length - 1;
    setTool('select');
    renderAll();
    return;
  }
  st.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  draw();
});

canvas.addEventListener('mousemove', (e) => {
  const p = tileAt(e);
  st.hover = p;
  if (p) {
    const i = p.y * st.map.width + p.x;
    status(`(${p.x}, ${p.y})\u3000地面 ${st.map.ground[i]}\u3000裝飾 ${st.map.deco[i]}${walkable(st.map, p.x, p.y) ? '\u3000可通行' : '\u3000不可通行'}`);
  }
  const d = st.drag;
  if (d && p && e.buttons) {
    d.x1 = p.x;
    d.y1 = p.y;
    if (d.moving) {
      const o = st.map.objects[st.sel]!;
      o.x = Math.max(0, Math.min(st.map.width - o.w, p.x - d.moving.dx));
      o.y = Math.max(0, Math.min(st.map.height - o.h, p.y - d.moving.dy));
    } else if (st.tool === 'paint' || st.tool === 'erase') paintAt(p.x, p.y);
  }
  draw();
});

window.addEventListener('mouseup', () => {
  const d = st.drag;
  st.drag = null;
  if (!d) return;
  const m = st.map;
  const r = rectOf(d);
  if (st.tool === 'rect') {
    const a = layerArray(m, st.layer);
    const t = st.layer === 'collision' ? TILE.BLOCK_MARK : st.layer === 'safe' ? TILE.SAFE_MARK : st.tile;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) a[y * m.width + x] = t;
  } else if (st.tool === 'exit') {
    m.objects.push({ kind: 'exit', name: `exit${m.objects.filter((o) => o.kind === 'exit').length + 1}`, ...r, props: { targetMap: '', targetX: 0, targetY: 0 } });
    st.sel = m.objects.length - 1;
    setTool('select');
    linkDialog(st.sel);
  } else if (st.tool === 'spawn') {
    const first = Object.keys(monsters).find((k) => k !== '_comment' && !monsters[k]!.boss) ?? 'slime';
    m.objects.push({ kind: 'spawn', name: `spawn${m.objects.filter((o) => o.kind === 'spawn').length + 1}`, ...r, props: { monster: first, count: 5, respawnSec: 60 } });
    st.sel = m.objects.length - 1;
    setTool('select');
  }
  renderAll();
});

canvas.addEventListener('mouseleave', () => {
  st.hover = null;
  draw();
});

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel >= 0) deleteSelected();
});

function deleteSelected(): void {
  if (st.sel < 0) return;
  snapshot();
  st.map.objects.splice(st.sel, 1);
  st.sel = -1;
  renderAll();
}

// ---------------------------------------------------------------- toolbar

const TOOLS: [Tool, string, string][] = [
  ['select', '選取／移動', '點物件選取，拖曳移動。Delete 刪除'],
  ['paint', '畫筆', '在所選圖層畫上所選圖塊'],
  ['erase', '橡皮擦', '清除圖塊（地面層改回草地）'],
  ['fill', '填滿', '把相連的同樣圖塊換成所選圖塊'],
  ['rect', '矩形', '拖曳畫出一塊矩形'],
  ['exit', '出口', '拖曳畫出出口範圍，再選擇通往哪張地圖'],
  ['spawn', '怪物區', '拖曳畫出怪物出現範圍'],
  ['npc', 'NPC', '點一下放置 NPC'],
  ['arrival', '傳送點', '點一下放置傳送 NPC／法術的抵達點'],
  ['start', '起點', '新角色出生點（只限村莊）'],
  ['respawn', '重生點', '死亡或回家卷軸後回到的點'],
];

function setTool(t: Tool): void {
  st.tool = t;
  renderToolbar();
}

function renderToolbar(): void {
  const bar = document.getElementById('toolbar')!;
  bar.replaceChildren(
    ...TOOLS.map(([t, name, tip]) => h('button', { class: st.tool === t ? 'on' : '', title: tip, onclick: () => setTool(t) }, name)),
    h('span', { class: 'muted' }, '｜'),
    h('button', { title: '復原（Ctrl+Z）', onclick: undo }, '↶ 復原'),
    h('span', { class: 'muted' }, '縮放'),
    select([['8', '8'], ['12', '12'], ['16', '16'], ['24', '24'], ['32', '32']], String(st.zoom), (v) => { st.zoom = Number(v); draw(); }),
  );
}

// ---------------------------------------------------------------- side panel

function renderSide(): void {
  const side = document.getElementById('side')!;
  side.replaceChildren(
    h('h3', {}, '地圖'), ...mapSection(),
    h('h3', {}, '自動產生'), ...genSection(),
    h('h3', {}, '圖塊（畫筆／填滿／矩形用）'), ...paletteSection(),
    h('h3', {}, '物件'), ...objectSection(),
    h('h3', {}, '檢查與儲存'), ...saveSection(),
  );
}

function renderAll(): void {
  draw();
  renderSide();
}

function mapSection(): HTMLElement[] {
  const m = st.map;
  const ids = Object.keys(st.others).sort();
  const open = select([['', '開啟現有地圖…'], ...ids.map((id): [string, string] => [id, `${mapName(id)}（${id}）`])], '', (id) => { if (id) openMap(id); });
  const idInput = h('input', { type: 'text', value: m.id, disabled: !st.isNew, onchange: (e: Event) => {
    const v = (e.target as HTMLInputElement).value.trim();
    m.id = v;
    m.props.nameKey = `map.${v}`;
    st.gen.id = v;
    renderSide();
  } });
  const suggest = () => {
    const lv = m.objects.filter((o) => o.kind === 'spawn').map((o) => monsters[String(o.props.monster)]?.level).filter((v): v is number => v !== undefined);
    if (!lv.length) return;
    m.props.levelRange = `${Math.min(...lv)}-${Math.max(...lv)}`;
    renderSide();
  };
  return [
    h('div', { class: 'row' }, open, h('button', { onclick: newMap }, '新地圖')),
    field('代號（英文）', idInput),
    field('中文名稱', h('input', { type: 'text', value: st.nameZh, onchange: (e: Event) => { st.nameZh = (e.target as HTMLInputElement).value; } })),
    field('死亡後回到', select([...new Set([...ids, m.id])].map((id): [string, string] => [id, mapName(id)]), m.props.respawnMap, (v) => { m.props.respawnMap = v; })),
    field('等級範圍（僅開發用）', h('span', {},
      h('input', { type: 'text', value: m.props.levelRange, style: 'width:70px', placeholder: '8-15', onchange: (e: Event) => { m.props.levelRange = (e.target as HTMLInputElement).value; } }),
      ' ', h('button', { title: '依怪物區的怪物等級填入', onclick: suggest }, '建議'))),
    h('div', { class: 'muted' }, `大小 ${m.width} × ${m.height} 格${st.isNew ? '（新地圖）' : ''}`),
  ];
}

function genSection(): HTMLElement[] {
  const g = st.gen;
  const set = (patch: Partial<GenOptions>) => { Object.assign(g, patch); renderSide(); };
  const presetNames: Record<Preset, string> = { meadow: '草原', forest: '森林', wasteland: '荒原', dungeon: '地下城／洞窟', village: '村莊（安全區）' };
  const out: HTMLElement[] = [
    field('類型', select(PRESETS.map((p): [string, string] => [p, presetNames[p]]), g.preset, (v) => set({ preset: v as Preset }))),
    h('div', { class: 'row' }, field('寬', num(g.width, (v) => set({ width: v }), 20, 200)), field('高', num(g.height, (v) => set({ height: v }), 15, 200))),
    h('div', { class: 'row' }, field('種子', num(g.seed, (v) => set({ seed: v }), 0, 999999)), h('button', { title: '換一個隨機種子並產生', onclick: () => { g.seed = Math.floor(Math.random() * 999999); doGenerate(); } }, '🎲 重抽')),
  ];
  if (g.preset === 'meadow' || g.preset === 'forest' || g.preset === 'wasteland') {
    out.push(
      field('樹木（%）', num(g.trees, (v) => set({ trees: v }), 0, 40)),
      field('岩石（%）', num(g.rocks, (v) => set({ rocks: v }), 0, 20)),
      field(g.preset === 'wasteland' ? '岩漿' : '水', select([['none', '無'], ['pond', '池塘'], ['river', '河流']], g.water, (v) => set({ water: v as GenOptions['water'] }))),
      field('道路', select([['none', '無'], ['ew', '東西向'], ['ns', '南北向'], ['cross', '十字']], g.road, (v) => set({ road: v as GenOptions['road'] }))),
      h('div', { class: 'muted' }, '道路通到地圖邊緣的缺口，出口放在那裡。'),
    );
  } else if (g.preset === 'dungeon') {
    const bosses = Object.keys(monsters).filter((k) => monsters[k]?.boss);
    out.push(
      field('房間數', num(g.rooms, (v) => set({ rooms: v }), 2, 30)),
      field('迷宮程度（0-100）', num(g.maze, (v) => set({ maze: v }), 0, 100)),
      field('頭目房間', h('input', { type: 'checkbox', checked: g.bossRoom, onchange: (e: Event) => set({ bossRoom: (e.target as HTMLInputElement).checked }) })),
      ...(g.bossRoom ? [field('頭目', select(bosses.map((k): [string, string] => [k, monsterLabel(k)]), g.boss, (v) => set({ boss: v })))] : []),
      h('div', { class: 'muted' }, '入口房間在西邊（有上樓梯，出口放那裡），頭目房間在東邊，重生 1–2 小時。'),
    );
  } else {
    out.push(field('房屋數', num(g.houses, (v) => set({ houses: v }), 0, 6)));
  }
  out.push(h('div', { class: 'row' }, h('button', { class: 'primary', onclick: doGenerate }, '產生地圖')));
  return out;
}

function doGenerate(): void {
  const g = st.gen;
  if (!st.isNew && !confirm(`用產生的地圖取代「${st.nameZh}」嗎？（可以復原）`)) return;
  snapshot();
  const m = generate({ ...g, id: st.map.id });
  m.props.respawnMap = g.preset === 'village' ? m.id : st.map.props.respawnMap;
  m.props.levelRange = st.map.props.levelRange;
  st.map = m;
  st.sel = -1;
  renderAll();
  status(`已產生：${g.preset}，種子 ${g.seed}`, 'ok');
}

function paletteSection(): HTMLElement[] {
  const pal = h('div', { id: 'palette' });
  for (let t = 0; t < TILE_COUNT; t++) {
    if (t === TILE.SAFE_MARK || t === TILE.BLOCK_MARK) continue;
    const c = h('canvas', { width: 32, height: 32, class: t === st.tile ? 'sel' : '', title: `#${t}`, onclick: () => { st.tile = t; if (st.tool === 'select') setTool('paint'); renderSide(); } });
    const cx = c.getContext('2d')!;
    cx.fillStyle = '#333';
    cx.fillRect(0, 0, 32, 32);
    drawTile(cx, t, 0, 0, 32);
    pal.append(c);
  }
  return [
    field('圖層', select([['ground', '地面'], ['deco', '裝飾（樹、牆…）'], ['collision', '隱形牆（阻擋）'], ['safe', '安全區']], st.layer, (v) => { st.layer = v as Layer; })),
    pal,
    h('div', { class: 'muted' }, '細部繪製建議用 Tiled（docs/MAPS.md），這裡只做小修改。'),
  ];
}

function objectSection(): HTMLElement[] {
  const m = st.map;
  const list = h('div', { id: 'objects' }, ...m.objects.map((o, i) => h('div', {
    class: i === st.sel ? 'sel' : '',
    onclick: () => { st.sel = i; renderAll(); },
  }, `${OBJ_LETTER[o.kind]} ${o.kind === 'spawn' ? monsterLabel(String(o.props.monster)) : o.kind === 'exit' ? `→ ${mapName(String(o.props.targetMap))}` : o.name}\u3000(${o.x}, ${o.y})`)));
  const out: HTMLElement[] = [list];
  const o = m.objects[st.sel];
  if (!o) {
    out.push(h('div', { class: 'muted' }, '用上方工具列放置物件；點清單或地圖上的物件來編輯。'));
    return out;
  }
  const setProp = (k: string, v: string | number) => { o.props[k] = v; renderAll(); };
  out.push(h('div', { class: 'muted' }, `位置 (${o.x}, ${o.y})${o.w > 1 || o.h > 1 ? `，大小 ${o.w} × ${o.h}` : ''}`));
  if (o.kind === 'exit') {
    out.push(
      field('通往', h('span', {}, mapName(String(o.props.targetMap || '（未設定）')), ' ', h('button', { onclick: () => linkDialog(st.sel) }, '設定…'))),
      h('div', { class: 'muted' }, `抵達 (${o.props.targetX}, ${o.props.targetY})`),
    );
  } else if (o.kind === 'spawn') {
    const ids = Object.keys(monsters).filter((k) => k !== '_comment').sort((a, b) => monsters[a]!.level - monsters[b]!.level);
    const isBoss = !!monsters[String(o.props.monster)]?.boss;
    out.push(
      field('名稱', h('input', { type: 'text', value: o.name, onchange: (e: Event) => { o.name = (e.target as HTMLInputElement).value.trim(); renderAll(); } })),
      field('怪物', select(ids.map((k): [string, string] => [k, monsterLabel(k)]), String(o.props.monster), (v) => {
        o.props.monster = v;
        if (monsters[v]?.boss) Object.assign(o.props, { count: 1, respawnSec: 3600, respawnMaxSec: 7200 }); // bosses: 1-2 h by default
        renderAll();
      })),
      field('數量', num(Number(o.props.count), (v) => setProp('count', v), 0, 99)),
    );
    if (isBoss) {
      out.push(
        field('重生最短（小時）', num(Number(o.props.respawnSec) / 3600, (v) => setProp('respawnSec', Math.round(v * 3600)), 0, 24)),
        field('重生最長（小時）', num(Number(o.props.respawnMaxSec ?? o.props.respawnSec) / 3600, (v) => setProp('respawnMaxSec', Math.round(v * 3600)), 0, 24)),
        h('div', { class: 'muted' }, '頭目：以遊玩時間計算，離開地圖或存檔也會記住。'),
      );
    } else {
      out.push(
        field('重生（秒）', num(Number(o.props.respawnSec), (v) => setProp('respawnSec', v), 1, 99999)),
        field('最長（秒，可空白）', h('input', { type: 'number', value: o.props.respawnMaxSec ?? '', onchange: (e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          if (v === '') delete o.props.respawnMaxSec;
          else o.props.respawnMaxSec = Number(v);
          renderAll();
        } })),
      );
    }
  } else if (o.kind === 'npc') {
    out.push(field('NPC', select(npcIds.map((k): [string, string] => [k, `${strings[(npcsData as Record<string, { nameKey: string }>)[k]!.nameKey] ?? k}（${k}）`]), String(o.props.npcId), (v) => { o.props.npcId = v; o.name = v; renderAll(); })));
  } else if (o.kind === 'arrival') {
    out.push(
      field('名稱', h('input', { type: 'text', value: o.name, onchange: (e: Event) => { o.name = (e.target as HTMLInputElement).value.trim(); renderAll(); } })),
      h('div', { class: 'muted' }, '傳送 NPC／法術以這個名稱指定目的地。'),
    );
  }
  out.push(h('div', { class: 'row' }, h('button', { class: 'danger', onclick: deleteSelected }, '刪除物件')));
  return out;
}

// ---------------------------------------------------------------- exits: link to another map

/** A walkable tile next to the rectangle (x, y, w, h) that is not inside it, preferring the map's inside. */
function besideRect(m: EdMap, r: { x: number; y: number; w: number; h: number }): { x: number; y: number } | null {
  const cand: { x: number; y: number; d: number }[] = [];
  for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
    if (!walkable(m, x, y) || m.objects.some((o) => o.kind === 'exit' && inside(o, x, y))) continue;
    cand.push({ x, y, d: Math.abs(x - m.width / 2) + Math.abs(y - m.height / 2) });
  }
  cand.sort((a, b) => a.d - b.d);
  return cand[0] ?? null;
}

function linkDialog(index: number): void {
  const exit = st.map.objects[index];
  if (!exit) return;
  const modal = document.getElementById('modal')!;
  const box = document.getElementById('modalBox')!;
  const targets = Object.keys(st.others).sort();
  let target = String(exit.props.targetMap || targets[0] || '');
  let wayBack = true;
  const preview = h('canvas');
  const close = () => { modal.style.display = 'none'; renderAll(); };
  const render = () => {
    const tm = st.others[target];
    const z = tm ? Math.max(6, Math.min(16, Math.floor(Math.min(900 / tm.width, 560 / tm.height)))) : 8;
    if (tm) {
      preview.width = tm.width * z;
      preview.height = tm.height * z;
      drawMapInto(preview.getContext('2d')!, tm, z);
    }
    preview.onclick = (e) => {
      if (!tm) return;
      const r = preview.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / z);
      const y = Math.floor((e.clientY - r.top) / z);
      snapshot();
      if (wayBack) {
        // The clicked tile becomes the way back; players arrive on a free tile next to it.
        if (!walkable(tm, x, y)) { alert('回程出口要放在可通行的格子上'); return; }
        const back = { x, y, w: 1, h: 1 };
        const arrive = besideRect(tm, back);
        const home = besideRect(st.map, exit);
        if (!arrive || !home) { alert('出口旁邊沒有可以抵達的空格'); return; }
        tm.objects.push({ kind: 'exit', name: `to_${st.map.id}`, ...back, props: { targetMap: st.map.id, targetX: home.x, targetY: home.y } });
        st.changedOthers.add(target);
        Object.assign(exit.props, { targetMap: target, targetX: arrive.x, targetY: arrive.y });
      } else {
        if (!walkable(tm, x, y)) { alert('請點可通行的格子'); return; }
        Object.assign(exit.props, { targetMap: target, targetX: x, targetY: y });
      }
      close();
    };
  };
  box.replaceChildren(
    h('div', { class: 'row' },
      field('通往地圖', select(targets.map((id): [string, string] => [id, `${mapName(id)}（${id}）`]), target, (v) => { target = v; render(); })),
      h('label', {}, h('input', { type: 'checkbox', checked: wayBack, onchange: (e: Event) => { wayBack = (e.target as HTMLInputElement).checked; } }), h('span', {}, '同時建立回程出口')),
      h('button', { onclick: close }, '取消'),
    ),
    h('div', { class: 'muted' }, '勾選回程：點目標地圖上「回程出口」的位置（玩家會出現在它旁邊）。不勾：點玩家抵達的位置。'),
    preview,
  );
  render();
  modal.style.display = 'flex';
}

// ---------------------------------------------------------------- open / new / check / save

function newMap(): void {
  if (!confirm('開新地圖？未儲存的修改會遺失。')) return;
  st.map = blankMap('newmap', st.gen.width, st.gen.height, TILE.GRASS);
  st.nameZh = '新地圖';
  st.isNew = true;
  st.undo = [];
  st.sel = -1;
  st.changedOthers.clear();
  renderAll();
}

async function loadOthers(): Promise<void> {
  const ids = (await (await fetch('/__editor/maps')).json()) as string[];
  st.others = {};
  for (const id of ids) st.others[id] = fromTiled(id, (await (await fetch(`/__editor/map?id=${id}`)).json()) as TiledMap);
}

function openMap(id: string): void {
  const m = st.others[id];
  if (!m) return;
  st.map = fromTiled(id, toTiled(m)); // a copy
  st.nameZh = strings[m.props.nameKey] ?? id;
  st.isNew = false;
  st.undo = [];
  st.sel = -1;
  st.changedOthers.clear();
  try { localStorage.setItem(LAST_KEY, id); } catch { /* not remembered */ }
  renderAll();
  status(`已開啟 ${st.nameZh}（${id}）`, 'ok');
}

/** Problems that would stop the map from working; also used before saving. */
function check(): string[] {
  const m = st.map;
  const errs: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/.test(m.id)) errs.push('代號只能用小寫英文字母、數字和底線，且以字母開頭');
  if (st.isNew && st.others[m.id]) errs.push(`代號「${m.id}」已經有地圖了`);
  if (!st.nameZh.trim()) errs.push('請填中文名稱');
  const names = m.objects.filter((o) => o.kind === 'spawn').map((o) => o.name);
  if (new Set(names).size !== names.length || names.some((n) => !n)) errs.push('每個怪物區都要有不同的名稱');
  for (const o of m.objects) if (o.kind === 'exit' && !o.props.targetMap) errs.push(`出口 (${o.x}, ${o.y}) 還沒設定通往哪張地圖`);
  if (errs.length) return errs;
  const all: Record<string, MapData> = {};
  for (const [id, om] of Object.entries(st.others)) all[id] = parseTiledMap(id, toTiled(om));
  all[m.id] = parseTiledMap(m.id, toTiled(m));
  const withName = { ...strings, [m.props.nameKey]: st.nameZh };
  for (const id of [m.id, ...st.changedOthers]) for (const e of checkMap(all, id, CONTENT, withName)) errs.push(id === m.id ? e : `${mapName(id)}：${e}`);
  return errs;
}

function saveSection(): HTMLElement[] {
  const msg = h('div', { id: 'messages' });
  const show = (lines: string[], ok: boolean) => {
    msg.className = ok ? 'ok' : 'err';
    msg.textContent = lines.join('\n');
  };
  return [
    h('div', { class: 'row' },
      h('button', { onclick: () => { const e = check(); show(e.length ? e : ['沒有問題'], !e.length); } }, '檢查'),
      h('button', { class: 'primary', onclick: () => void save(show) }, '儲存'),
    ),
    msg,
    h('div', { class: 'muted' }, '儲存會寫入 maps/<代號>.json、地圖名稱、tuning/spawns.csv，並執行 npm run tuning。之後請執行 npm test，再 commit。'),
  ];
}

async function save(show: (lines: string[], ok: boolean) => void): Promise<void> {
  const errs = check();
  if (errs.length) return show(errs, false);
  const m = st.map;
  const maps: Record<string, unknown> = { [m.id]: toTiled(m) };
  for (const id of st.changedOthers) maps[id] = toTiled(st.others[id]!);
  const spawns = m.objects.filter((o) => o.kind === 'spawn').map((o) => ({
    map: m.id, spawn: o.name, monster: o.props.monster, count: o.props.count,
    respawn_sec: o.props.respawnSec, respawn_max_sec: o.props.respawnMaxSec ?? '', area: `${o.x},${o.y},${o.w},${o.h}`,
  }));
  show(['儲存中…'], true);
  try { localStorage.setItem(LAST_KEY, m.id); } catch { /* not remembered */ }
  const res = await fetch('/__editor/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maps, names: { [m.props.nameKey]: st.nameZh }, spawnMaps: [m.id], spawns }),
  });
  const out = (await res.json()) as { ok?: boolean; output?: string; error?: string };
  if (!res.ok || !out.ok) return show([`儲存失敗：${out.error ?? ''}`, out.output ?? ''], false);
  show(['已儲存。', out.output ?? '', '接著執行 npm test 確認，再 commit。'], true);
  st.isNew = false;
  st.changedOthers.clear();
  await loadOthers();
}

// ---------------------------------------------------------------- start

renderToolbar();
renderAll();
void loadOthers().then(() => {
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_KEY); } catch { /* none */ }
  if (last && st.others[last]) openMap(last);
  else renderAll();
});
