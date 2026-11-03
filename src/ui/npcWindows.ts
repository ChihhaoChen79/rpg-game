// Windows opened by village NPCs: shop (buy/sell), warehouse, blacksmith. They only send
// Commands; the logic checks gold, weight, slots and that the player stands next to the NPC.
import Phaser from 'phaser';
import { CONTENT } from '../content';
import type { Command } from '../logic/commands';
import { mergeGroups, mergeNeed, scaledBonus } from '../logic/accessory';
import { countItem } from '../logic/inventory';
import { derive } from '../logic/stats';
import { packSize, repairCost, sellPrice } from '../logic/town';
import { BONUS_KEYS, type GameState, type ItemStack } from '../logic/types';
import { drawInfoLines, equipProblem, itemInfoLines } from './itemInfo';
import { bookBadge } from './spellText';
import { openNumberBox, type NumberBox } from './numberBox';
import { num, t } from './strings';
import { button, COLORS, consumePointer, iconImage, label } from './widgets';

export interface NpcSelection {
  tab: 'buy' | 'sell' | 'put' | 'take'; // shop: buy / sell; warehouse: 存放 / 領出
  pick: string | null; // shop row whose details are shown: item id (buy) or stack uid (sell)
  amounts: Record<string, number>; // shop: amount per row, same keys as pick
  scroll: number; // shop: first row shown
  gold: number; // warehouse: gold amount to put in / take out
}

export function newNpcSelection(): NpcSelection {
  return { tab: 'buy', pick: null, amounts: {}, scroll: 0, gold: 0 };
}

export interface NpcWindowCtx {
  scene: Phaser.Scene;
  state: GameState;
  npcId: string;
  sel: NpcSelection;
  issue(cmd: Command): void;
  rerender(): void;
  message(text: string): void;
}

/**
 * Re-render whenever any of this changes. Shop amounts and scrolling are left out: they update
 * the window in place, so a held − / + button isn't rebuilt under the finger.
 */
export function npcWindowSignature(s: GameState, sel: NpcSelection): string {
  const p = s.player;
  const stacks = (a: ItemStack[]) => a.map((i) => `${i.uid}:${i.count}:${i.dur}`).join(',');
  return `${JSON.stringify({ ...sel, amounts: undefined, scroll: undefined })}|${p.gold}|${stacks(p.inventory)}|${stacks(s.shared.items)}|${s.shared.gold}|${p.equipment.weapon?.dur ?? '-'}`;
}

// ---------------------------------------------------------------- shared pieces

/** "+N" in the top-left corner of an enhanced item's slot (as in the inventory). */
function enhBadge(scene: Phaser.Scene, x: number, y: number, enh: number): Phaser.GameObjects.Text {
  return label(scene, x, y, `+${enh}`, { size: 10, stroke: true, color: '#9fe0ff' });
}

// ---------------------------------------------------------------- shop

/** Shop window height. */
export const SHOP_H = 520;
const ROW_H_LAND = 44;
const LIST = { x: 12, y: 76, w: 404, rows: 8 };
const PICKED_ROW = 0x2a2418; // rows with an amount are tinted

interface ShopRow {
  key: string; // item id (buy) or stack uid (sell)
  itemId: string;
  stack?: ItemStack; // sell tab
  price: number | null; // buy: gold per pack; sell: gold for the whole stack; warehouse: none
  pack: number; // items per purchase (buy tab: arrows come in packs of 10); 1 when selling
  sellable: boolean;
}

/**
 * Buy and sell lists: one row per item with − amount + MAX, the item's details on the right,
 * the total and one button that buys or sells everything at the bottom.
 */
export function fillShop(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, w: number, h: number): void {
  fillList(ctx, c, w, h, 'shop');
}

/** Warehouse (shared by all characters): 存放 / 領出 lists like the shop; gold in the header. */
export function fillWarehouse(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, w: number, h: number): void {
  fillList(ctx, c, w, h, 'warehouse');
}

/**
 * The list window of the shop (buy / sell) and the warehouse (存放 / 領出): rows with
 * - amount + MAX, the tapped row's details on the right, one button for everything chosen.
 */
function fillList(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, w: number, h: number, mode: 'shop' | 'warehouse'): void {
  const { scene, state, sel } = ctx;
  const p = state.player;
  const b = CONTENT.balance;
  // Portrait (a 512 px wide window): the list takes the full width, 4 rows of 40 px, the tapped
  // row's details go in a strip under it instead of a pane on the right.
  const P = w < 600;
  const ROW_H = P ? 40 : ROW_H_LAND;
  const npc = CONTENT.npcs[ctx.npcId]!;
  const stock = CONTENT.shops[npc.shop ?? '']?.items ?? [];
  const tabs = mode === 'shop' ? (['buy', 'sell'] as const) : (['put', 'take'] as const);
  if (!(tabs as readonly string[]).includes(sel.tab)) sel.tab = tabs[0];
  const tab = (k: NpcSelection['tab'], x: number) => {
    c.add(button(scene, x, 38, 100, 30, t(mode === 'shop' ? `shop.${k}` : `wh.tab.${k}`), () => {
      closeEditor();
      sel.tab = k;
      sel.pick = null;
      sel.amounts = {};
      sel.scroll = 0;
      ctx.rerender();
    }, { color: sel.tab === k ? 0x6a6030 : undefined }).container);
  };
  tab(tabs[0], 16);
  tab(tabs[1], 122);
  if (mode === 'shop') c.add(label(scene, w - 16, 46, t('inv.gold', { n: p.gold }), { size: 14, color: '#ffe08a' }).setOrigin(1, 0));
  else warehouseGold(ctx, c, w);

  const buying = sel.tab === 'buy';
  const stackRow = (st: ItemStack, price: number | null, sellable: boolean): ShopRow =>
    ({ key: String(st.uid), itemId: st.itemId, stack: st, price, pack: 1, sellable });
  const rows: ShopRow[] = buying
    ? stock.map((id) => ({ key: id, itemId: id, price: CONTENT.items[id]!.price, pack: packSize(state, id), sellable: true }))
    : sel.tab === 'sell'
      ? p.inventory.map((st) => {
        const d = CONTENT.items[st.itemId]!;
        return stackRow(st, sellPrice(state, st.itemId, st.count), d.price > 0 && d.kind !== 'gold');
      })
      : (sel.tab === 'put' ? p.inventory : state.shared.items).map((st) => stackRow(st, null, true));
  // Forget amounts for stacks that are gone (sold, used, dropped).
  for (const k of Object.keys(sel.amounts)) if (!rows.some((r) => r.key === k)) delete sel.amounts[k];
  const amount = (r: ShopRow) => sel.amounts[r.key] ?? 0;

  /** Most of this row: gold / weight / slots for buying, the whole stack otherwise. */
  const maxFor = (r: ShopRow): number => {
    if (!r.sellable) return 0;
    if (!buying) return r.stack!.count;
    const d = CONTENT.items[r.itemId]!;
    const dv = derive(CONTENT, p);
    let gold = p.gold;
    let weight = dv.maxWeight - dv.weight;
    let slots = b.inventorySlots - p.inventory.length;
    for (const o of rows) {
      const n = amount(o);
      if (o === r || n === 0) continue;
      const od = CONTENT.items[o.itemId]!;
      const items = n * o.pack;
      gold -= od.price * n;
      weight -= od.weight * items;
      slots -= od.stackable ? (p.inventory.some((st) => st.itemId === o.itemId && st.count + items <= b.maxStack) ? 0 : 1) : items;
    }
    // In packs: gold buys packs, weight and slots count the items in them.
    let max = Math.min(Math.floor(b.maxStack / r.pack), d.price > 0 ? Math.floor(gold / d.price) : b.maxStack);
    if (d.weight > 0) max = Math.min(max, Math.floor(weight / (d.weight * r.pack)));
    if (!d.stackable) max = Math.min(max, Math.floor(slots / r.pack));
    else if (slots < 1 && !p.inventory.some((st) => st.itemId === r.itemId && st.count < b.maxStack)) max = 0;
    return Math.max(0, max);
  };

  // ---- list (only the visible rows are drawn; scrolling redraws them)
  const lx = LIST.x;
  const ly = LIST.y;
  const lw = P ? w - 24 : LIST.w;
  const visible = P ? 4 : LIST.rows;
  const sh = lw - LIST.w; // portrait: the price and the - amount + MAX controls move to the right edge
  const listH = visible * ROW_H;
  c.add(scene.add.rectangle(lx, ly, lw, listH + 4, 0x15151f).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
  if (rows.length === 0) c.add(label(scene, lx + 12, ly + 12, t(mode === 'shop' ? (buying ? 'shop.emptyBuy' : 'shop.emptySell') : `wh.empty.${sel.tab}`), { size: 13, color: '#9090a8' }));
  const maxScroll = Math.max(0, rows.length - visible);
  sel.scroll = Math.min(sel.scroll, maxScroll);
  const rowsC = scene.add.container(0, 0);
  c.add(rowsC);
  const qtyTexts = new Map<string, { text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Rectangle; row: ShopRow }>();

  // ---- typing an amount: tapping a row's number opens one HTML text box over it (phones show
  // their number keyboard). Every keystroke updates the amount, so - / + / MAX start from it.
  let editor: NumberBox | null = null;
  function closeEditor(): void {
    editor?.close();
  }
  const openEditor = (r: ShopRow, box: Phaser.GameObjects.Rectangle) => {
    editor = openNumberBox(scene, box, {
      value: amount(r),
      max: maxFor(r),
      onInput: (n) => {
        if (n > 0) sel.amounts[r.key] = n;
        else delete sel.amounts[r.key];
        refresh();
      },
      onClose: () => {
        editor = null;
        refresh();
      },
    });
  };

  const setAmount = (r: ShopRow, n: number) => {
    closeEditor();
    const v = Math.max(0, Math.min(n, maxFor(r)));
    if (v > 0) sel.amounts[r.key] = v;
    else delete sel.amounts[r.key];
    refresh();
  };

  const drawRows = () => {
    rowsC.removeAll(true);
    qtyTexts.clear();
    rows.slice(sel.scroll, sel.scroll + visible).forEach((r, i) => {
      const y = ly + 2 + i * ROW_H;
      const d = CONTENT.items[r.itemId]!;
      const picked = sel.pick === r.key;
      const bg = scene.add.rectangle(lx + 2, y, lw - 10, ROW_H - 2, amount(r) > 0 ? PICKED_ROW : 0x15151f).setOrigin(0)
        .setStrokeStyle(picked ? 2 : 0, COLORS.select);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', (ptr: Phaser.Input.Pointer) => startDrag(ptr, r.key));
      rowsC.add(bg);
      const dim = r.sellable ? 1 : 0.35;
      rowsC.add(scene.add.rectangle(lx + 6, y + 4, 34, 34, COLORS.slot).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge).setAlpha(dim));
      rowsC.add(iconImage(scene, lx + 23, y + 21, d.icon, 30).setAlpha(dim));
      rowsC.add(bookBadge(scene, lx + 23, y + 21, d, 30));
      if (r.stack && r.stack.enh > 0) rowsC.add(enhBadge(scene, lx + 8, y + 4, r.stack.enh));
      if (r.stack && d.stackable && r.stack.count > 1) rowsC.add(label(scene, lx + 39, y + 39, num(r.stack.count), { size: 10, stroke: true }).setOrigin(1, 1));
      const name = r.pack > 1 ? t('shop.pack', { item: t(d.nameKey), n: r.pack }) : t(d.nameKey);
      rowsC.add(label(scene, lx + 46, y + 13, name, { size: 13, color: r.sellable ? '#f0f0f0' : '#70708a' }));
      if (r.price !== null) rowsC.add(label(scene, lx + 246 + sh, y + 14, num(r.price), { size: 12, color: '#ffe08a' }).setOrigin(1, 0));
      if (!r.sellable) return;
      const minus = holdButton(scene, lx + 252 + sh, y + 6, 30, 30, '-', () => setAmount(r, amount(r) - 1));
      const plus = holdButton(scene, lx + 324 + sh, y + 6, 30, 30, '+', () => setAmount(r, amount(r) + 1));
      // MAX, unless this shop sells things one at a time (spellbooks).
      const noMax = buying && CONTENT.shops[npc.shop ?? '']?.noMax;
      const max = noMax ? null : button(scene, lx + 358 + sh, y + 6, 36, 30, 'MAX', () => setAmount(r, maxFor(r)), { size: 11 });
      // The amount: a box to type in (tap it), between - and +.
      const box = scene.add.rectangle(lx + 285 + sh, y + 6, 37, 30, 0x22223a).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge);
      box.setInteractive({ useHandCursor: true }).on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        consumePointer(scene, ptr);
        openEditor(r, box);
      });
      const qty = label(scene, lx + 303 + sh, y + 21, '', { size: 15 }).setOrigin(0.5);
      rowsC.add([minus, plus, box, qty]);
      if (max) rowsC.add(max.container);
      qtyTexts.set(r.key, { text: qty, bg, row: r });
    });
    // Scroll bar
    if (maxScroll > 0) {
      const barH = Math.max(24, (listH * visible) / rows.length);
      const barY = ly + 2 + ((listH - barH) * sel.scroll) / maxScroll;
      rowsC.add(scene.add.rectangle(lx + lw - 6, barY, 4, barH, 0x6a6a90).setOrigin(0));
    }
    refresh();
  };

  // ---- swipe / wheel to scroll; a tap without moving shows the row's details
  let drag: { y: number; scroll: number; key: string; moved: boolean } | null = null;
  const startDrag = (ptr: Phaser.Input.Pointer, key: string) => {
    consumePointer(scene, ptr);
    closeEditor();
    drag = { y: ptr.worldY, scroll: sel.scroll, key, moved: false };
  };
  const scrollTo = (n: number) => {
    const v = Math.max(0, Math.min(maxScroll, n));
    if (v === sel.scroll) return;
    sel.scroll = v;
    drawRows();
  };
  const onMove = (ptr: Phaser.Input.Pointer) => {
    if (!drag || !ptr.isDown) return;
    const dy = ptr.worldY - drag.y;
    if (Math.abs(dy) > 8) drag.moved = true;
    if (drag.moved) scrollTo(drag.scroll - Math.round(dy / ROW_H));
  };
  const onUp = () => {
    const d = drag;
    drag = null;
    if (d && !d.moved) {
      sel.pick = d.key;
      ctx.rerender();
    }
  };
  const onWheel = (ptr: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
    const px = ptr.worldX - c.x;
    const py = ptr.worldY - c.y;
    if (px >= lx && px <= lx + lw && py >= ly && py <= ly + listH) scrollTo(sel.scroll + Math.sign(dy) * 2);
  };
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('wheel', onWheel);
  c.once('destroy', () => {
    editor?.close();
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.off('wheel', onWheel);
  });

  // ---- details of the tapped row
  const dx = P ? lx : lx + lw + 8;
  const dw = P ? lw : w - 12 - dx;
  const dTop = P ? ly + listH + 10 : ly;
  // Portrait: the bottom bar is a fixed 56 px; the details strip takes what is left above it.
  const barH = 56;
  const dH = P ? h - 8 - barH - 6 - dTop : listH + 4;
  c.add(scene.add.rectangle(dx, dTop, dw, dH, 0x15151f).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
  const pickRow = rows.find((r) => r.key === sel.pick);
  if (!pickRow) c.add(label(scene, dx + 10, dTop + 10, t(mode === 'shop' ? 'shop.pickHint' : 'wh.pickHint', { fee: b.warehouseFee }), { size: 12, color: '#9090a8', wrap: dw - 20 }));
  else {
    const d = CONTENT.items[pickRow.itemId]!;
    const enh = pickRow.stack?.enh ?? 0;
    c.add(label(scene, dx + 10, dTop + 8, `${enh > 0 ? `+${enh} ` : ''}${t(d.nameKey)}`, { size: 14, bold: true, wrap: dw - 20 }));
    const lines = itemInfoLines(p, d, enh, d.weapon ? pickRow.stack?.dur : undefined);
    if (buying) lines.push({ text: t('shop.owned', { n: countItem(p, pickRow.itemId) }) });
    const problem = equipProblem(p, d);
    if (problem) lines.push({ text: problem });
    // Portrait: the strip is short; show the lines that fit and put the rest behind a "?" button.
    let shown = lines;
    if (P) {
      const perRow = Math.max(4, Math.floor((dw - 60) / 12));
      const maxRows = Math.max(1, Math.floor((dH - 36) / 15));
      let rowsUsed = 0;
      shown = [];
      for (const l of lines) {
        const r = Math.max(1, Math.ceil(l.text.length / perRow));
        if (rowsUsed + r > maxRows) break;
        rowsUsed += r;
        shown.push(l);
      }
      if (shown.length < lines.length) {
        c.add(button(scene, dx + dw - 40, dTop + 6, 32, 28, '?', () => ctx.message(lines.map((l) => l.text).join('\n')), { size: 14 }).container);
      }
    }
    drawInfoLines(scene, c, dx + 10, dTop + 30, shown, { size: 12, color: problem ? '#ffb0a0' : '#c8c8dc', wrap: P ? dw - 60 : dw - 20, onHelp: ctx.message });
  }

  // ---- bottom: total, buy / sell everything, clear
  const by = P ? h - 8 - barH : ly + listH + 12;
  const bh = h - (P ? 8 : 12) - by;
  c.add(scene.add.rectangle(12, by, w - 24, bh, 0x1c1a24).setOrigin(0).setStrokeStyle(1, 0xff9040));
  const totalText = label(scene, 26, by + (P ? 8 : 12), '', { size: 15, color: '#ffe08a' });
  const subText = label(scene, 26, by + (P ? 31 : 36), '', { size: 12, color: '#c0c0d8' });
  c.add([totalText, subText]);
  const goLabel = { buy: 'shop.buyAll', sell: 'shop.sellAll', put: 'wh.putAll', take: 'wh.takeAll' }[sel.tab];
  const btnH = P ? 38 : 46;
  const go = button(scene, w - 262, by + (bh - btnH) / 2, 150, btnH, t(goLabel), () => {
    closeEditor();
    const picked = rows.filter((r) => amount(r) > 0);
    const stacks = picked.map((r) => ({ uid: Number(r.key), count: amount(r) }));
    if (buying) ctx.issue({ type: 'buyMany', npcId: ctx.npcId, items: picked.map((r) => ({ itemId: r.itemId, count: amount(r) })) });
    else if (sel.tab === 'sell') ctx.issue({ type: 'sellMany', npcId: ctx.npcId, items: stacks });
    else ctx.issue({ type: sel.tab === 'put' ? 'depositMany' : 'withdrawMany', npcId: ctx.npcId, items: stacks });
    sel.amounts = {};
    refresh();
  }, { size: 17 });
  const clear = button(scene, w - 104, by + (bh - btnH) / 2, 80, btnH, t('shop.clear'), () => {
    closeEditor();
    sel.amounts = {};
    refresh();
  }, { size: 14 });
  c.add([go.container, clear.container]);

  function refresh(): void {
    for (const { text, bg, row } of qtyTexts.values()) {
      const n = amount(row);
      text.setText(num(n)).setColor(n > 0 ? '#ffffff' : '#66667a');
      bg.setFillStyle(n > 0 ? PICKED_ROW : 0x15151f);
    }
    const picked = rows.filter((r) => amount(r) > 0);
    const count = picked.reduce((n, r) => n + amount(r) * r.pack, 0);
    if (mode === 'warehouse') {
      const fee = b.warehouseFee;
      const take = sel.tab === 'take';
      totalText.setText(take ? t('wh.takeTotal', { fee }) : t('wh.putTotal', { n: count }));
      subText.setText(take ? t('wh.takeSub', { n: count, gold: p.gold })
        : t('wh.putSub', { n: state.shared.items.length, max: b.warehouseSlots, gold: p.gold }));
      go.setEnabled(count > 0 && (!take || p.gold >= fee));
      clear.setEnabled(count > 0);
      return;
    }
    const total = buying
      ? picked.reduce((n, r) => n + (r.price ?? 0) * amount(r), 0)
      : picked.reduce((n, r) => n + sellPrice(state, r.itemId, amount(r)), 0);
    totalText.setText(t('shop.total', { n: total }));
    subText.setText(buying ? t('shop.subBuy', { n: count, left: p.gold - total }) : t('shop.subSell', { n: count }));
    go.setEnabled(count > 0 && (!buying || total <= p.gold));
    clear.setEnabled(count > 0);
  }

  drawRows();
}

/**
 * A button that repeats while held: one step on press, then after a short pause steps
 * keep coming, faster the longer it's held.
 */
function holdButton(scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string, step: () => void): Phaser.GameObjects.Container {
  const b = button(scene, x, y, w, h, text, step, { size: 16 });
  const bg = b.container.list[0] as Phaser.GameObjects.Rectangle;
  let timer: Phaser.Time.TimerEvent | null = null;
  const stop = () => {
    timer?.remove();
    timer = null;
  };
  bg.on('pointerdown', () => {
    stop();
    let n = 0;
    const repeat = () => {
      n++;
      for (let i = 0; i < (n > 20 ? 10 : 1); i++) step();
      timer = scene.time.delayedCall(n > 5 ? 50 : 100, repeat);
    };
    timer = scene.time.delayedCall(400, repeat);
    scene.input.once('pointerup', stop);
  });
  bg.on('pointerout', stop);
  b.container.once('destroy', stop);
  return b.container;
}

// ---------------------------------------------------------------- warehouse

/** Warehouse gold in the window header: amount box, 存入 (free) and 取出 (fee from the gold taken). */
function warehouseGold(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, w: number): void {
  const { scene, state, sel } = ctx;
  const p = state.player;
  const store = state.shared;
  const P = w < 600; // portrait: everything squeezed into the tab row
  const bx = P ? w - 168 : w - 236;
  c.add(label(scene, P ? 222 : 236, P ? 47 : 46, t('wh.gold', { n: store.gold }), { size: P ? 12 : 13, color: '#ffe08a' }));
  const box = scene.add.rectangle(bx, 38, P ? 56 : 74, 30, 0x22223a).setOrigin(0).setStrokeStyle(2, 0x6a6aa0);
  box.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
    openNumberBox(scene, box, { value: sel.gold, max: Math.max(p.gold, store.gold), onClose: (n) => {
      sel.gold = n;
      ctx.rerender();
    } });
  });
  c.add([box, label(scene, bx + (P ? 28 : 37), 53, num(sel.gold), { size: 15 }).setOrigin(0.5)]);
  c.add(button(scene, P ? w - 108 : w - 156, 38, P ? 50 : 68, 30, t('wh.goldIn'), () => ctx.issue({ type: 'depositGold', npcId: ctx.npcId, amount: sel.gold }),
    { size: 13, enabled: sel.gold > 0 && p.gold > 0 }).container);
  c.add(button(scene, P ? w - 54 : w - 84, 38, P ? 50 : 68, 30, t('wh.goldOut'), () => ctx.issue({ type: 'withdrawGold', npcId: ctx.npcId, amount: sel.gold }),
    { size: 13, enabled: sel.gold > 0 && store.gold > 0 }).container);
}

// ---------------------------------------------------------------- jeweler

/** 珠寶匠: N identical accessories (same +level) become one of the next +level. */
export function fillJeweler(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, w: number, h: number): void {
  const { scene, state } = ctx;
  const p = state.player;
  c.add(label(scene, 16, 40, t('jeweler.hint', { max: CONTENT.balance.accessoryMergeCounts.length }), { size: 13, color: '#c8c8dc', wrap: w - 32 }));
  const groups = mergeGroups(CONTENT, p.inventory);
  if (groups.length === 0) c.add(label(scene, w / 2, h / 2, t('jeweler.none'), { size: 14, color: '#9090a8' }).setOrigin(0.5));
  groups.slice(0, w < 600 ? 6 : 7).forEach((g, i) => {
    const def = CONTENT.items[g.itemId]!;
    const y = 96 + i * 46;
    const need = mergeNeed(CONTENT, g.enh);
    const ok = g.count >= need;
    c.add(scene.add.rectangle(12, y, w - 24, 42, 0x1a1a26).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
    c.add(iconImage(scene, 34, y + 21, def.icon, 30));
    if (g.enh > 0) c.add(enhBadge(scene, 20, y + 4, g.enh));
    c.add(label(scene, 56, y + 4, `${t(def.nameKey)}  +${g.enh} 升 +${g.enh + 1}`, { size: 14 }));
    const next = scaledBonus(CONTENT, def, g.enh + 1);
    const parts = BONUS_KEYS.filter((k) => next.bonus[k]).map((k) => t(`bonus.${k}`, { n: `+${next.bonus[k]}` }));
    if (next.def) parts.push(t('inv.def', { n: next.def }));
    if (next.mr) parts.push(t('inv.mr', { n: next.mr }));
    c.add(label(scene, 56, y + 24, parts.join('、'), { size: 11, color: '#a8a8c8' }));
    c.add(label(scene, w - 130, y + 21, t('jeweler.have', { n: g.count, need }), { size: 13, color: ok ? '#9fe09a' : '#c8c8dc' }).setOrigin(1, 0.5));
    c.add(button(scene, w - 116, y + 5, 96, 32, t('jeweler.merge'), () => ctx.issue({ type: 'mergeAccessory', npcId: ctx.npcId, itemId: g.itemId, enh: g.enh }), { enabled: ok }).container);
  });
}

// ---------------------------------------------------------------- blacksmith

export function fillSmith(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, w: number, h: number): void {
  const { scene, state } = ctx;
  const p = state.player;
  c.add(label(scene, 16, 40, t('smith.hint'), { size: 13, color: '#c8c8dc', wrap: w < 600 ? w - 150 : w - 32 }));
  c.add(label(scene, w - 16, 40, t('inv.gold', { n: p.gold }), { size: 14, color: '#ffe08a' }).setOrigin(1, 0));
  const weapons: { st: ItemStack; equipped: boolean }[] = [];
  if (p.equipment.weapon) weapons.push({ st: p.equipment.weapon, equipped: true });
  for (const st of p.inventory) if (CONTENT.items[st.itemId]?.weapon) weapons.push({ st, equipped: false });
  let total = 0;
  weapons.slice(0, w < 600 ? 6 : 7).forEach(({ st, equipped }, i) => {
    const def = CONTENT.items[st.itemId]!;
    const max = def.weapon!.durability;
    const cost = repairCost(state, st);
    total += cost;
    const y = 84 + i * 46;
    c.add(scene.add.rectangle(12, y, w - 24, 42, 0x1a1a26).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
    c.add(iconImage(scene, 34, y + 21, def.icon, 30));
    c.add(label(scene, 56, y + 4, `${t(def.nameKey)}${equipped ? t('smith.equipped') : ''}`, { size: 14 }));
    const frac = max > 0 ? st.dur / max : 1;
    c.add(scene.add.rectangle(56, y + 26, 160, 8, COLORS.barBg).setOrigin(0));
    c.add(scene.add.rectangle(57, y + 27, 158 * frac, 6, frac > 0.5 ? 0x60c060 : frac > 0.25 ? 0xe0b040 : 0xe05040).setOrigin(0));
    c.add(label(scene, 224, y + 21, t('inv.durability', { n: st.dur, max }), { size: 12, color: '#c8c8dc' }).setOrigin(0, 0.5));
    if (cost > 0) {
      c.add(label(scene, w - 130, y + 21, t('smith.cost', { n: cost }), { size: 13, color: cost > p.gold ? '#ff8a7a' : '#ffe08a' }).setOrigin(1, 0.5));
      c.add(button(scene, w - 116, y + 5, 96, 32, t('smith.repair'), () => ctx.issue({ type: 'repair', npcId: ctx.npcId, uid: st.uid }), { enabled: cost <= p.gold }).container);
    } else {
      c.add(label(scene, w - 68, y + 21, t('smith.ok'), { size: 13, color: '#9fe09a' }).setOrigin(0.5));
    }
  });
  if (total > 0) {
    c.add(button(scene, w / 2 - 110, h - 56, 220, 40, t('smith.repairAll', { n: total }), () => {
      ctx.issue({ type: 'repair', npcId: ctx.npcId, uid: 'all' });
    }, { enabled: total <= p.gold }).container);
  } else {
    c.add(label(scene, w / 2, h - 36, t('smith.none'), { size: 14, color: '#9090a8' }).setOrigin(0.5));
  }
}
