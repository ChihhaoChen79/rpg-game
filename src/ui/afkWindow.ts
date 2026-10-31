// 輔助 window: auto-hunt and assist settings (docs/PLAN.md §7.22), four tabs:
// 攻擊 (what the 自動 button does: attack mode, resting, targeting, hunt radius, going home),
// 輔助 (buffs to keep up), 條件 (rules "HP below N% → use ..."), 拾取 (loot and ignore list).
// The last three have their own on/off switch and also work while playing by hand.
// Every change is a setAfkSettings command; the logic cleans it up.
import Phaser from 'phaser';
import { CONTENT } from '../content';
import { afkAttackSpells, afkBuffOptions, afkRuleItems, afkRuleSpells, countableItem, isPctStat } from '../logic/afkSettings';
import type { Command } from '../logic/commands';
import { countItem } from '../logic/inventory';
import type { AfkAction, AfkRule, AfkSettings, GameState } from '../logic/types';
import { openNumberBox } from './numberBox';
import { openPicker, type PickerOption } from './picker';
import { screensaverPref, setScreensaverPref } from './screensaver';
import { t } from './strings';
import { button, COLORS, iconImage, label } from './widgets';

export type AfkTab = 'attack' | 'buffs' | 'rules' | 'loot';
const TABS: AfkTab[] = ['attack', 'buffs', 'rules', 'loot'];
const ON_COLOR = 0x2a4a3a;
const MUTED = '#9090b0';
const HEAD = '#ffe08a';

export interface AfkWindowCtx {
  scene: Phaser.Scene;
  state: GameState;
  tab: AfkTab;
  setTab(tab: AfkTab): void;
  issue(cmd: Command): void;
  center(): { x: number; y: number }; // where pop-up lists go
}

/** Ignore-list page (kept between redraws). */
let lootPage = 0;
let lootLast: string | null = null;

export function fillAfk(ctx: AfkWindowCtx, c: Phaser.GameObjects.Container, w: number): void {
  const { scene, state } = ctx;
  const p = state.player;
  const set = p.afkSettings;
  const update = (patch: Partial<AfkSettings>) => ctx.issue({ type: 'setAfkSettings', settings: { ...set, ...patch } });

  // ---- small building blocks
  const toggle = (x: number, y: number, bw: number, text: string, on: boolean, flip: () => void) =>
    c.add(button(scene, x, y, bw, 32, text, flip, { size: 13, color: on ? ON_COLOR : undefined }).container);
  /** A ▾ box that opens a pop-up list. */
  const pickBox = <T>(x: number, y: number, bw: number, text: string, icon: string | undefined, title: string,
    options: PickerOption<T>[], isCurrent: (v: T) => boolean, onPick: (v: T) => void) => {
    const bg = scene.add.rectangle(x, y, bw, 30, 0x2a2a44).setOrigin(0).setStrokeStyle(1, 0x6a6aa0);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const ctr = ctx.center();
      openPicker(scene, ctr.x, ctr.y, title, options, isCurrent, onPick);
    });
    c.add(bg);
    let tx = x + 8;
    if (icon) {
      c.add(iconImage(scene, x + 16, y + 15, icon, 22));
      tx = x + 30;
    }
    c.add(label(scene, tx, y + 15, text, { size: 13 }).setOrigin(0, 0.5));
    c.add(label(scene, x + bw - 6, y + 15, '▾', { size: 13, color: '#a0a0c0' }).setOrigin(1, 0.5));
  };
  /** A tap-to-type number; the change is sent when the box closes. */
  const numBox = (x: number, y: number, bw: number, value: number, max: number, onDone: (n: number) => void) => {
    const bg = scene.add.rectangle(x, y, bw, 30, 0x22223a).setOrigin(0).setStrokeStyle(2, 0x6a6aa0);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      openNumberBox(scene, bg, { value, max, onClose: (n) => n !== value && onDone(n) });
    });
    c.add([bg, label(scene, x + bw / 2, y + 15, String(value), { size: 15 }).setOrigin(0.5)]);
  };
  const text = (x: number, y: number, s: string, color = '#e8e8f0', size = 14, wrap?: number) =>
    c.add(label(scene, x, y, s, { size, color, wrap }));

  // ---- tabs
  TABS.forEach((k, i) => {
    c.add(button(scene, 16 + i * 112, 38, 106, 30, t(`afkWin.tab.${k}`), () => ctx.setTab(k),
      { size: 14, color: ctx.tab === k ? 0x6a6030 : undefined }).container);
  });
  const y0 = 80;

  if (ctx.tab === 'attack') {
    // Main attack
    text(20, y0, t('afkWin.mainAttack'), HEAD, 13);
    c.add(label(scene, w - 20, y0, t('afkWin.attackTabNote'), { size: 12, color: MUTED }).setOrigin(1, 0));
    const spells = afkAttackSpells(CONTENT, p);
    type Atk = AfkSettings['attack'];
    const atkLabel = (a: Atk) => (a.kind === 'auto' ? t('afkWin.attackAuto') : a.kind === 'weapon' ? t('afkWin.attackWeapon')
      : t('afkWin.spellMp', { spell: t(CONTENT.spells[a.spellId]!.nameKey), mp: CONTENT.spells[a.spellId]!.mp }));
    const atkOptions: PickerOption<Atk>[] = [
      { label: t('afkWin.attackAuto'), value: { kind: 'auto' } },
      { label: t('afkWin.attackWeapon'), value: { kind: 'weapon' } },
      ...spells.map((id): PickerOption<Atk> => ({ label: atkLabel({ kind: 'spell', spellId: id }), icon: CONTENT.spells[id]!.icon, value: { kind: 'spell', spellId: id } })),
    ];
    const sameAtk = (a: Atk) => a.kind === set.attack.kind && (a.kind !== 'spell' || (set.attack.kind === 'spell' && a.spellId === set.attack.spellId));
    pickBox(20, y0 + 20, 260, atkLabel(set.attack), set.attack.kind === 'spell' ? CONTENT.spells[set.attack.spellId]?.icon : undefined,
      t('afkWin.mainAttack'), atkOptions, sameAtk, (a) => update({ attack: a }));
    text(292, y0 + 22, t('afkWin.attackHelp'), MUTED, 12, w - 310);

    // Resting
    text(20, y0 + 66, t('afkWin.rest'), HEAD, 13);
    text(20, y0 + 92, 'HP <', '#e8e8f0', 14);
    numBox(66, y0 + 86, 50, set.restHpPct, 100, (n) => update({ restHpPct: n }));
    text(122, y0 + 92, '%　MP <', '#e8e8f0', 14);
    numBox(190, y0 + 86, 50, set.restMpPct, 100, (n) => update({ restMpPct: n }));
    text(246, y0 + 92, '%', '#e8e8f0', 14);
    text(270, y0 + 84, t('afkWin.restHelp', { n: CONTENT.balance.afkRestResumePct }), MUTED, 12, w - 290);

    // Targeting
    text(20, y0 + 132, t('afkWin.targeting'), HEAD, 13);
    toggle(20, y0 + 152, 270, t('afkWin.targetAttackers', { state: t(set.targetAttackers ? 'afk.on' : 'afk.off') }), set.targetAttackers,
      () => update({ targetAttackers: !set.targetAttackers }));
    toggle(300, y0 + 152, 200, t('afkWin.avoidBoss', { state: t(set.avoidBoss ? 'afk.on' : 'afk.off') }), set.avoidBoss,
      () => update({ avoidBoss: !set.avoidBoss }));
    text(20, y0 + 202, t('afkWin.radius1'), '#e8e8f0', 14);
    numBox(140, y0 + 196, 54, set.huntRadius, 200, (n) => update({ huntRadius: n }));
    text(202, y0 + 202, t('afkWin.radius2'), '#e8e8f0', 14);

    // Going home, screensaver
    text(20, y0 + 244, t('afkWin.stopHead'), HEAD, 13);
    text(20, y0 + 270, t('afkWin.weight1'), '#e8e8f0', 14);
    numBox(118, y0 + 264, 50, set.returnWeightPct, 100, (n) => update({ returnWeightPct: n }));
    text(176, y0 + 270, t('afkWin.weight2'), '#e8e8f0', 14);
    toggle(20, y0 + 304, 230, t('afk.returnWhenOut', { state: t(set.returnWhenOut ? 'afk.on' : 'afk.off') }), set.returnWhenOut,
      () => update({ returnWhenOut: !set.returnWhenOut }));
    toggle(262, y0 + 304, 200, t('afk.screensaver', { state: t(screensaverPref() ? 'afk.on' : 'afk.off') }), screensaverPref(), () => {
      setScreensaverPref(!screensaverPref());
      ctx.setTab('attack');
    });
    return;
  }

  if (ctx.tab === 'buffs') {
    toggle(20, y0, 200, t('afkWin.buffsOn', { state: t(set.buffsOn ? 'afk.on' : 'afk.off') }), set.buffsOn, () => update({ buffsOn: !set.buffsOn }));
    text(232, y0 + 2, t('afkWin.buffHelp'), MUTED, 12, w - 252);
    const opts = afkBuffOptions(CONTENT, p);
    if (opts.length === 0) text(20, y0 + 48, t('afkWin.noBuffs'), MUTED, 14, w - 40);
    opts.slice(0, 7).forEach((key, i) => {
      const y = y0 + 44 + i * 40;
      const [kind, id] = key.split(':') as ['spell' | 'item', string];
      const on = set.buffs.includes(key);
      c.add(button(scene, 20, y, 34, 32, on ? '✔' : '', () => update({ buffs: on ? set.buffs.filter((k) => k !== key) : [...set.buffs, key] }),
        { size: 15, color: on ? ON_COLOR : undefined }).container);
      const def = kind === 'spell' ? CONTENT.spells[id]! : CONTENT.items[id]!;
      c.add(iconImage(scene, 76, y + 16, def.icon, 26));
      text(96, y + 7, t(def.nameKey), '#e8e8f0', 14);
      const note = kind === 'spell' ? t('afkWin.buffMp', { mp: CONTENT.spells[id]!.mp }) : t('afkWin.buffOwned', { n: countItem(p, id) });
      text(250, y + 9, note, MUTED, 12);
    });
    const by = y0 + 44 + 7 * 40 + 6;
    toggle(20, by, 300, t('afkWin.buffNear', { state: t(set.buffNearMonsters ? 'afk.on' : 'afk.off') }), set.buffNearMonsters,
      () => update({ buffNearMonsters: !set.buffNearMonsters }));
    return;
  }

  if (ctx.tab === 'rules') {
    const rules = set.rules;
    const setRules = (r: AfkRule[]) => update({ rules: r });
    const actionLabel = (a: AfkAction): { text: string; icon?: string } => {
      switch (a.kind) {
        case 'item': return { text: t(CONTENT.items[a.itemId]!.nameKey), icon: CONTENT.items[a.itemId]!.icon };
        case 'spell': return { text: t(CONTENT.spells[a.spellId]!.nameKey), icon: CONTENT.spells[a.spellId]!.icon };
        default: return { text: t(`afkWin.action.${a.kind}`) };
      }
    };
    const actionOptions: PickerOption<AfkAction>[] = [
      ...(['hpPotion', 'mpPotion', 'bestHeal'] as const).map((k): PickerOption<AfkAction> => ({ label: t(`afkWin.action.${k}`), value: { kind: k } })),
      ...afkRuleSpells(CONTENT, p).map((id): PickerOption<AfkAction> => ({ label: t(CONTENT.spells[id]!.nameKey), icon: CONTENT.spells[id]!.icon, value: { kind: 'spell', spellId: id } })),
      ...afkRuleItems(CONTENT, p).map((id): PickerOption<AfkAction> => ({ label: t(CONTENT.items[id]!.nameKey), icon: CONTENT.items[id]!.icon, value: { kind: 'item', itemId: id } })),
      { label: t('afkWin.action.return'), value: { kind: 'return' } },
    ];
    const sameAction = (a: AfkAction, b: AfkAction) => JSON.stringify(a) === JSON.stringify(b);
    type Stat = { stat: AfkRule['stat']; itemId?: string };
    const statLabel = (r: Stat) => (r.stat === 'count' ? t('afkWin.countOf', { item: t(CONTENT.items[r.itemId!]!.nameKey) })
      : isPctStat(r.stat) ? r.stat.toUpperCase() : t(`afkWin.stat.${r.stat}`));
    const countables = Object.keys(CONTENT.items).filter((id) => countableItem(CONTENT, id) && (CONTENT.items[id]!.kind === 'consumable' || CONTENT.items[id]!.kind === 'ammo'));
    const statOptions: PickerOption<Stat>[] = [
      { label: 'HP', value: { stat: 'hp' } },
      { label: 'MP', value: { stat: 'mp' } },
      { label: t('afkWin.stat.ammo'), icon: 'arrows', value: { stat: 'ammo' } },
      { label: t('afkWin.stat.hpPotions'), icon: 'potion_red', value: { stat: 'hpPotions' } },
      { label: t('afkWin.stat.mpPotions'), icon: 'potion_blue', value: { stat: 'mpPotions' } },
      ...countables.map((id): PickerOption<Stat> => ({ label: statLabel({ stat: 'count', itemId: id }), icon: CONTENT.items[id]!.icon, value: { stat: 'count', itemId: id } })),
    ];
    toggle(20, y0, 200, t('afkWin.rulesOn', { state: t(set.rulesOn ? 'afk.on' : 'afk.off') }), set.rulesOn, () => update({ rulesOn: !set.rulesOn }));
    text(232, y0 + 2, t('afkWin.rulesOnHelp'), MUTED, 12, w - 252);
    rules.forEach((r, i) => {
      const y = y0 + 46 + i * 42;
      c.add(scene.add.rectangle(14, y - 4, w - 28, 38, 0x15151f).setOrigin(0).setStrokeStyle(1, 0x33334a));
      text(20, y + 5, String(i + 1), '#8080a0', 12);
      pickBox(36, y, 128, statLabel(r), r.stat === 'count' ? CONTENT.items[r.itemId!]?.icon : undefined, t('afkWin.pickStat'), statOptions,
        (v) => v.stat === r.stat && v.itemId === r.itemId,
        (v) => setRules(rules.map((x, j) => (j === i ? { ...x, stat: v.stat, itemId: v.itemId, below: v.stat === r.stat ? x.below : isPctStat(v.stat) ? 30 : 1 } : x))));
      text(170, y + 6, t('afkWin.below'), '#e8e8f0', 13);
      numBox(204, y, 50, r.below, isPctStat(r.stat) ? 100 : 9999, (n) => setRules(rules.map((x, j) => (j === i ? { ...x, below: n } : x))));
      text(258, y + 6, isPctStat(r.stat) ? '%' : '', '#e8e8f0', 13);
      const al = actionLabel(r.action);
      pickBox(276, y, 196, al.text, al.icon, t('afkWin.pickAction'), actionOptions, (a) => sameAction(a, r.action),
        (a) => setRules(rules.map((x, j) => (j === i ? { ...x, action: a } : x))));
      const move = (d: number) => {
        const to = i + d;
        if (to < 0 || to >= rules.length) return;
        const next = [...rules];
        [next[i], next[to]] = [next[to]!, next[i]!];
        setRules(next);
      };
      c.add(button(scene, w - 136, y, 34, 30, '▲', () => move(-1), { size: 13, enabled: i > 0 }).container);
      c.add(button(scene, w - 98, y, 34, 30, '▼', () => move(1), { size: 13, enabled: i < rules.length - 1 }).container);
      c.add(button(scene, w - 60, y, 34, 30, '-', () => setRules(rules.filter((_, j) => j !== i)), { size: 16, color: 0x5a2a2a }).container);
    });
    const ay = y0 + 46 + rules.length * 42 + 4;
    const full = rules.length >= CONTENT.balance.afkMaxRules;
    c.add(button(scene, 20, ay, 150, 32, t('afkWin.addRule'), () => setRules([...rules, { stat: 'hp', below: 50, action: { kind: 'hpPotion' } }]),
      { size: 14, color: ON_COLOR, enabled: !full }).container);
    text(180, ay + 2, t('afkWin.rulesHelp', { n: CONTENT.balance.afkMaxRules }), MUTED, 12, w - 200);
    return;
  }

  // ---- loot / other
  toggle(20, y0, 200, t('afk.pickup', { state: t(set.pickup ? 'afk.on' : 'afk.off') }), set.pickup, () => update({ pickup: !set.pickup }));
  text(232, y0 + 2, t('afkWin.pickupHelp'), MUTED, 12, w - 252);
  text(20, y0 + 42, t('afkWin.ignoreHelp'), HEAD, 13);
  const drops = [...new Set(Object.values(CONTENT.monsters).flatMap((m) => m.drops.map((d) => d.itemId)))]
    .filter((id) => CONTENT.items[id] && CONTENT.items[id]!.kind !== 'gold')
    .sort((a, b) => CONTENT.items[a]!.kind.localeCompare(CONTENT.items[b]!.kind) || CONTENT.items[a]!.price - CONTENT.items[b]!.price);
  const cols = 14;
  const rowsN = 3;
  const per = cols * rowsN;
  const pages = Math.max(1, Math.ceil(drops.length / per));
  lootPage = Math.min(lootPage, pages - 1);
  drops.slice(lootPage * per, lootPage * per + per).forEach((id, i) => {
    const x = 20 + (i % cols) * 40;
    const y = y0 + 62 + Math.floor(i / cols) * 40;
    const ignored = set.ignore.includes(id);
    const bg = scene.add.rectangle(x, y, 37, 37, COLORS.slot).setOrigin(0).setStrokeStyle(ignored ? 2 : 1, ignored ? 0xc04040 : COLORS.slotEdge);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      lootLast = id;
      update({ ignore: ignored ? set.ignore.filter((x2) => x2 !== id) : [...set.ignore, id] });
    });
    c.add([bg, iconImage(scene, x + 18, y + 18, CONTENT.items[id]!.icon, 30).setAlpha(ignored ? 0.35 : 1)]);
    if (ignored) c.add(label(scene, x + 34, y + 2, '✕', { size: 13, color: '#ff6060', stroke: true }).setOrigin(1, 0));
  });
  const gy = y0 + 62 + rowsN * 40 + 4;
  if (lootLast && CONTENT.items[lootLast]) {
    text(20, gy, t(set.ignore.includes(lootLast) ? 'afkWin.ignored' : 'afkWin.picked', { item: t(CONTENT.items[lootLast]!.nameKey) }), '#c8c8dc', 13);
  }
  if (pages > 1) {
    c.add(button(scene, w - 150, gy - 4, 40, 28, '◀', () => { lootPage = (lootPage + pages - 1) % pages; ctx.setTab('loot'); }, { size: 12 }).container);
    text(w - 104, gy, `${lootPage + 1}/${pages}`, MUTED, 12);
    c.add(button(scene, w - 66, gy - 4, 40, 28, '▶', () => { lootPage = (lootPage + 1) % pages; ctx.setTab('loot'); }, { size: 12 }).container);
  }
  text(20, gy + 30, t('afkWin.goldAlways'), MUTED, 12);
}
