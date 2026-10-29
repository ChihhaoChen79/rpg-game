// Tuning sheets <-> game data. The CSV files in tuning/ are the source of truth for items,
// equipment, monsters, drops, spawn numbers and the Exp table; `npm run tuning` turns them into
// data/items.json, data/monsters.json, data/exp-table.json, the item/monster names in
// data/strings.zh-TW.json, and the spawn properties in maps/*.json. Pure functions only;
// tools/tuning.mjs does the file reading and writing.
import { csvObjects, toCsv } from './csv.mjs';

export const TICKS = 10; // ticks per second
const CLASSES = ['knight', 'elf', 'mage'];
const SLOTS = ['weapon', 'shield', 'helmet', 'armor', 'cloak', 'gloves', 'boots'];
const EFFECTS = ['heal', 'maxDamage', 'return', 'teleport', 'save'];

export const SHEETS = {
  items: ['id', 'name', 'description', 'kind', 'effect', 'hp', 'mp', 'buff_sec', 'cooldown_group', 'cooldown_sec',
    'arrow_damage', 'classes', 'weight', 'price', 'icon'],
  equipment: ['id', 'name', 'description', 'slot', 'classes', 'level', 'dmg_min', 'dmg_max', 'hit', 'attack_sec', 'range',
    'two_handed', 'anim', 'bow_melee_min', 'bow_melee_max', 'durability', 'wear_pct', 'def', 'mr', 'safe_enchant',
    'weight', 'price', 'icon', 'sprite'],
  monsters: ['id', 'name', 'level', 'hp', 'dmg_min', 'dmg_max', 'hit', 'evasion', 'def', 'mr', 'attack_sec', 'sec_per_tile',
    'aggressive', 'aggro_range', 'leash_range', 'exp', 'alignment', 'gold_min', 'gold_max', 'boss', 'sprite', 'frame'],
  drops: ['monster', 'item', 'chance_pct', 'min', 'max'],
  spawns: ['map', 'spawn', 'monster', 'count', 'respawn_sec', 'respawn_max_sec', 'area'],
  exp: ['level', 'exp_to_next', 'total_exp'],
};

// ---------------------------------------------------------------- small helpers

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const yes = (v) => ['yes', 'y', 'true', '1', '是', 'o'].includes(String(v).toLowerCase());
const yn = (b) => (b ? 'yes' : 'no');

class Errors {
  constructor() { this.list = []; }
  add(sheet, row, col, msg) { this.list.push(`tuning/${sheet}.csv line ${row?._line ?? '?'}${col ? `, column "${col}"` : ''}: ${msg}`); }
}

function num(e, sheet, row, col, { int = false, min = -Infinity, optional = false } = {}) {
  const raw = row[col];
  if (raw === undefined || raw === '') {
    if (optional) return undefined;
    e.add(sheet, row, col, 'is empty');
    return 0;
  }
  const v = Number(raw);
  if (!Number.isFinite(v) || (int && !Number.isInteger(v)) || v < min) {
    e.add(sheet, row, col, `"${raw}" is not ${int ? 'a whole number' : 'a number'}${min > -Infinity ? ` >= ${min}` : ''}`);
    return 0;
  }
  return v;
}

function oneOf(e, sheet, row, col, allowed, optional = false) {
  const v = row[col];
  if (!v && optional) return undefined;
  if (!allowed.includes(v)) e.add(sheet, row, col, `"${v}" must be one of: ${allowed.join(', ')}`);
  return v;
}

function classList(e, sheet, row) {
  const v = row.classes;
  if (!v) return undefined;
  const list = v.split(/[\s|/、,]+/).filter(Boolean);
  for (const c of list) if (!CLASSES.includes(c)) e.add(sheet, row, 'classes', `unknown class "${c}" (use ${CLASSES.join(', ')})`);
  return list.length === CLASSES.length ? undefined : list;
}

function ids(e, sheet, rows) {
  const seen = new Set();
  for (const r of rows) {
    if (!/^[a-z0-9_]+$/.test(r.id ?? '')) e.add(sheet, r, 'id', 'use lower-case letters, digits and _');
    if (seen.has(r.id)) e.add(sheet, r, 'id', `duplicate id "${r.id}"`);
    seen.add(r.id);
  }
}

// ---------------------------------------------------------------- export (data -> CSV)

export function exportSheets({ items, monsters, totalExp, strings, maps }) {
  const s = (k) => strings[k] ?? '';
  const itemRows = [];
  const equipRows = [];
  for (const [id, d] of Object.entries(items)) {
    if (id === '_comment') continue;
    if (d.kind === 'equipment') {
      const w = d.weapon;
      equipRows.push({
        id, name: s(d.nameKey), description: d.descKey ? s(d.descKey) : '', slot: d.slot, classes: (d.classes ?? []).join(' '),
        level: d.level ?? 1, dmg_min: w?.dmg[0] ?? '', dmg_max: w?.dmg[1] ?? '', hit: w?.hit ?? '',
        attack_sec: w ? round(w.attackTicks / TICKS) : '', range: w?.range ?? '', two_handed: w ? yn(w.twoHanded) : '',
        anim: w?.anim ?? '', bow_melee_min: w?.meleeDmg?.[0] ?? '', bow_melee_max: w?.meleeDmg?.[1] ?? '',
        durability: w?.durability ?? '', wear_pct: w?.wearChance !== undefined ? round(w.wearChance * 100) : '',
        def: d.def ?? 0, mr: d.mr ?? 0, safe_enchant: d.safeEnchant ?? (d.slot === 'weapon' ? 6 : 4),
        weight: round(d.weight / 10), price: d.price, icon: d.icon, sprite: d.sprite ?? '',
      });
    } else {
      const u = d.use;
      itemRows.push({
        id, name: s(d.nameKey), description: d.descKey ? s(d.descKey) : '', kind: d.kind, effect: u?.type ?? '',
        hp: u?.hp ?? '', mp: u?.mp ?? '', buff_sec: u?.ticks ? round(u.ticks / TICKS) : '',
        cooldown_group: d.cooldownGroup ?? '', cooldown_sec: d.cooldownTicks !== undefined ? round(d.cooldownTicks / TICKS) : '',
        arrow_damage: d.arrowDamage ?? '', classes: (d.classes ?? []).join(' '), weight: round(d.weight / 10), price: d.price, icon: d.icon,
      });
    }
  }
  const monsterRows = [];
  const dropRows = [];
  for (const [id, m] of Object.entries(monsters)) {
    if (id === '_comment') continue;
    monsterRows.push({
      id, name: s(m.nameKey), level: m.level, hp: m.hp, dmg_min: m.dmg[0], dmg_max: m.dmg[1], hit: m.hit, evasion: m.evasion,
      def: m.def, mr: m.mr, attack_sec: round(m.attackTicks / TICKS), sec_per_tile: round(m.stepTicks / TICKS),
      aggressive: yn(m.aggressive), aggro_range: m.aggroRange, leash_range: m.leashRange, exp: m.exp, alignment: m.alignment,
      gold_min: m.gold[0], gold_max: m.gold[1], boss: yn(m.boss), sprite: m.sprite, frame: m.frame ?? 64,
    });
    for (const d of m.drops) {
      dropRows.push({ monster: id, item: d.itemId, chance_pct: round(d.chance * 100), min: d.count?.[0] ?? 1, max: d.count?.[1] ?? 1 });
    }
  }
  const spawnRows = [];
  for (const [mapId, map] of Object.entries(maps)) {
    for (const o of objectsOf(map)) {
      if ((o.type || o.class) !== 'spawn') continue;
      const p = (n) => o.properties?.find((x) => x.name === n)?.value;
      spawnRows.push({
        map: mapId, spawn: o.name, monster: p('monster'), count: p('count'), respawn_sec: p('respawnSec'),
        respawn_max_sec: p('respawnMaxSec') ?? '', area: `${o.x / map.tilewidth},${o.y / map.tileheight},${o.width / map.tilewidth},${o.height / map.tileheight}`,
      });
    }
  }
  const expRows = [];
  for (let L = 1; L < totalExp.length; L++) expRows.push({ level: L, exp_to_next: totalExp[L] - totalExp[L - 1], total_exp: totalExp[L] });
  return {
    items: toCsv(SHEETS.items, itemRows),
    equipment: toCsv(SHEETS.equipment, equipRows),
    monsters: toCsv(SHEETS.monsters, monsterRows),
    drops: toCsv(SHEETS.drops, dropRows),
    spawns: toCsv(SHEETS.spawns, spawnRows),
    exp: toCsv(SHEETS.exp, expRows),
  };
}

function objectsOf(map) {
  return map.layers.filter((l) => l.type === 'objectgroup').flatMap((l) => l.objects);
}

// ---------------------------------------------------------------- import (CSV -> data)

/**
 * Build game data from the sheets. `exists(relativePath)` checks art files.
 * Returns { items, monsters, totalExp, names, maps, errors }; `names` maps strings keys to text,
 * `maps` are the given Tiled maps with spawn properties updated.
 */
export function importSheets(csv, { maps, exists }) {
  const e = new Errors();
  const items = { _comment: 'GENERATED by `npm run tuning` from tuning/items.csv and tuning/equipment.csv. Edit those, not this file.' };
  const names = {};

  const itemRows = csvObjects(csv.items);
  const equipRows = csvObjects(csv.equipment);
  ids(e, 'items', itemRows);
  ids(e, 'equipment', equipRows);

  for (const r of itemRows) {
    const kind = oneOf(e, 'items', r, 'kind', ['consumable', 'ammo', 'gold']);
    const d = { nameKey: `item.${r.id}` };
    names[`item.${r.id}`] = r.name;
    if (r.description) {
      d.descKey = `item.${r.id}.desc`;
      names[d.descKey] = r.description;
    }
    if (!r.name) e.add('items', r, 'name', 'is empty');
    d.icon = r.icon;
    if (!exists(`assets/sprites/icons/${r.icon}.png`)) e.add('items', r, 'icon', `no file assets/sprites/icons/${r.icon}.png`);
    d.kind = kind;
    d.weight = Math.round(num(e, 'items', r, 'weight', { min: 0 }) * 10);
    d.price = num(e, 'items', r, 'price', { int: true, min: 0 });
    d.stackable = true;
    const classes = classList(e, 'items', r);
    if (classes) d.classes = classes;
    const effect = oneOf(e, 'items', r, 'effect', EFFECTS, true);
    if (effect === 'heal') {
      d.use = { type: 'heal' };
      const hp = num(e, 'items', r, 'hp', { int: true, min: 0, optional: true });
      const mp = num(e, 'items', r, 'mp', { int: true, min: 0, optional: true });
      if (hp) d.use.hp = hp;
      if (mp) d.use.mp = mp;
      if (!hp && !mp) e.add('items', r, 'hp', 'a heal item needs hp and/or mp');
    } else if (effect === 'maxDamage') {
      d.use = { type: 'maxDamage', ticks: Math.round(num(e, 'items', r, 'buff_sec', { min: 0 }) * TICKS) };
    } else if (effect) d.use = { type: effect };
    if (kind === 'consumable' && !effect) e.add('items', r, 'effect', 'a consumable needs an effect');
    if (r.cooldown_group) {
      d.cooldownGroup = r.cooldown_group;
      d.cooldownTicks = Math.round(num(e, 'items', r, 'cooldown_sec', { min: 0 }) * TICKS);
    }
    if (kind === 'ammo') d.arrowDamage = num(e, 'items', r, 'arrow_damage', { int: true, min: 0 });
    items[r.id] = d;
  }

  for (const r of equipRows) {
    const slot = oneOf(e, 'equipment', r, 'slot', SLOTS);
    const d = { nameKey: `item.${r.id}` };
    names[`item.${r.id}`] = r.name;
    if (r.description) {
      d.descKey = `item.${r.id}.desc`;
      names[d.descKey] = r.description;
    }
    d.icon = r.icon;
    if (!exists(`assets/sprites/icons/${r.icon}.png`)) e.add('equipment', r, 'icon', `no file assets/sprites/icons/${r.icon}.png`);
    d.kind = 'equipment';
    d.slot = slot;
    if (r.sprite) {
      d.sprite = r.sprite;
      if (!exists(`assets/sprites/characters/${r.sprite}.png`)) e.add('equipment', r, 'sprite', `no file assets/sprites/characters/${r.sprite}.png`);
    }
    d.weight = Math.round(num(e, 'equipment', r, 'weight', { min: 0 }) * 10);
    d.price = num(e, 'equipment', r, 'price', { int: true, min: 0 });
    d.stackable = false;
    const classes = classList(e, 'equipment', r);
    if (classes) d.classes = classes;
    d.level = num(e, 'equipment', r, 'level', { int: true, min: 1 });
    if (slot === 'weapon') {
      const anim = oneOf(e, 'equipment', r, 'anim', ['slash', 'thrust', 'shoot']);
      const w = {
        anim,
        dmg: [num(e, 'equipment', r, 'dmg_min', { int: true, min: 0 }), num(e, 'equipment', r, 'dmg_max', { int: true, min: 0 })],
        hit: num(e, 'equipment', r, 'hit', { int: true }),
        attackTicks: Math.round(num(e, 'equipment', r, 'attack_sec', { min: 0.1 }) * TICKS),
        range: num(e, 'equipment', r, 'range', { int: true, min: 1 }),
        ranged: anim === 'shoot',
        twoHanded: yes(r.two_handed),
      };
      if (w.dmg[0] > w.dmg[1]) e.add('equipment', r, 'dmg_max', 'is smaller than dmg_min');
      if (anim === 'shoot') w.meleeDmg = [num(e, 'equipment', r, 'bow_melee_min', { int: true, min: 0 }), num(e, 'equipment', r, 'bow_melee_max', { int: true, min: 0 })];
      w.durability = num(e, 'equipment', r, 'durability', { int: true, min: 0 });
      const wear = num(e, 'equipment', r, 'wear_pct', { min: 0, optional: true });
      if (wear !== undefined) w.wearChance = round(wear / 100, 5);
      d.weapon = w;
    }
    const def = num(e, 'equipment', r, 'def', { int: true, optional: true });
    const mr = num(e, 'equipment', r, 'mr', { int: true, optional: true });
    if (def || slot !== 'weapon') d.def = def ?? 0;
    if (mr) d.mr = mr;
    d.safeEnchant = num(e, 'equipment', r, 'safe_enchant', { int: true, min: 0, optional: true }) ?? (slot === 'weapon' ? 6 : 4);
    items[r.id] = d;
  }

  // monsters + drops
  const monsters = { _comment: 'GENERATED by `npm run tuning` from tuning/monsters.csv and tuning/drops.csv. Edit those, not this file.' };
  const monsterRows = csvObjects(csv.monsters);
  ids(e, 'monsters', monsterRows);
  for (const r of monsterRows) {
    names[`monster.${r.id}`] = r.name;
    const frame = num(e, 'monsters', r, 'frame', { int: true, min: 16, optional: true }) ?? 64;
    const m = {
      nameKey: `monster.${r.id}`, sprite: r.sprite,
      ...(frame !== 64 ? { frame } : {}),
      ...(yes(r.boss) ? { boss: true } : {}),
      level: num(e, 'monsters', r, 'level', { int: true, min: 1 }),
      hp: num(e, 'monsters', r, 'hp', { int: true, min: 1 }),
      dmg: [num(e, 'monsters', r, 'dmg_min', { int: true, min: 0 }), num(e, 'monsters', r, 'dmg_max', { int: true, min: 0 })],
      hit: num(e, 'monsters', r, 'hit', { int: true }),
      evasion: num(e, 'monsters', r, 'evasion', { int: true }),
      def: num(e, 'monsters', r, 'def', { int: true, min: 0 }),
      mr: num(e, 'monsters', r, 'mr', { int: true, min: 0 }),
      attackTicks: Math.round(num(e, 'monsters', r, 'attack_sec', { min: 0.1 }) * TICKS),
      stepTicks: Math.round(num(e, 'monsters', r, 'sec_per_tile', { min: 0.1 }) * TICKS),
      aggressive: yes(r.aggressive),
      aggroRange: num(e, 'monsters', r, 'aggro_range', { int: true, min: 0 }),
      leashRange: num(e, 'monsters', r, 'leash_range', { int: true, min: 1 }),
      exp: num(e, 'monsters', r, 'exp', { int: true, min: 0 }),
      alignment: num(e, 'monsters', r, 'alignment', { int: true }),
      gold: [num(e, 'monsters', r, 'gold_min', { int: true, min: 0 }), num(e, 'monsters', r, 'gold_max', { int: true, min: 0 })],
      drops: [],
    };
    if (!exists(`assets/sprites/monsters/${r.sprite}.png`)) e.add('monsters', r, 'sprite', `no file assets/sprites/monsters/${r.sprite}.png`);
    monsters[r.id] = m;
  }
  for (const r of csvObjects(csv.drops)) {
    const m = monsters[r.monster];
    if (!m || r.monster === '_comment') { e.add('drops', r, 'monster', `unknown monster "${r.monster}"`); continue; }
    if (!items[r.item]) { e.add('drops', r, 'item', `unknown item "${r.item}"`); continue; }
    const min = num(e, 'drops', r, 'min', { int: true, min: 1, optional: true }) ?? 1;
    const max = num(e, 'drops', r, 'max', { int: true, min: 1, optional: true }) ?? min;
    const drop = { itemId: r.item, chance: round(num(e, 'drops', r, 'chance_pct', { min: 0 }) / 100, 5) };
    if (min !== 1 || max !== 1) drop.count = [min, max];
    m.drops.push(drop);
  }

  // spawns -> map object properties (areas stay as drawn in Tiled)
  const outMaps = structuredClone(maps);
  for (const r of csvObjects(csv.spawns)) {
    const map = outMaps[r.map];
    if (!map) { e.add('spawns', r, 'map', `unknown map "${r.map}"`); continue; }
    const o = objectsOf(map).find((x) => (x.type || x.class) === 'spawn' && x.name === r.spawn);
    if (!o) { e.add('spawns', r, 'spawn', `no spawn area named "${r.spawn}" in maps/${r.map}.json (draw it in Tiled first)`); continue; }
    if (!monsters[r.monster]) e.add('spawns', r, 'monster', `unknown monster "${r.monster}"`);
    const props = [
      { name: 'monster', type: 'string', value: r.monster },
      { name: 'count', type: 'int', value: num(e, 'spawns', r, 'count', { int: true, min: 0 }) },
      { name: 'respawnSec', type: 'int', value: num(e, 'spawns', r, 'respawn_sec', { min: 0 }) },
    ];
    const max = num(e, 'spawns', r, 'respawn_max_sec', { min: 0, optional: true });
    if (max !== undefined) props.push({ name: 'respawnMaxSec', type: 'int', value: max });
    o.properties = props;
  }

  // exp table
  const totalExp = [0];
  const expRows = csvObjects(csv.exp);
  expRows.forEach((r, i) => {
    const L = num(e, 'exp', r, 'level', { int: true, min: 1 });
    if (L !== i + 1) e.add('exp', r, 'level', `expected level ${i + 1} (rows must be in order, starting at 1)`);
    totalExp.push(totalExp[i] + num(e, 'exp', r, 'exp_to_next', { int: true, min: 1 }));
  });

  return { items, monsters, totalExp, names, maps: outMaps, errors: e.list };
}

/** The default "hardcore" curve: Exp to next level = base x growth^(level-1). */
export function exponentialExp(levels, base, growth) {
  const rows = [];
  let total = 0;
  for (let L = 1; L < levels; L++) {
    const toNext = Math.round(base * growth ** (L - 1));
    total += toNext;
    rows.push({ level: L, exp_to_next: toNext, total_exp: total });
  }
  return toCsv(SHEETS.exp, rows);
}
