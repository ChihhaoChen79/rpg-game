// Windows opened by village NPCs: shop (buy/sell), warehouse, blacksmith. They only send
// Commands; the logic checks gold, weight, slots and that the player stands next to the NPC.
import Phaser from 'phaser';
import { CONTENT } from '../content';
import type { Command } from '../logic/commands';
import { countItem } from '../logic/inventory';
import { derive } from '../logic/stats';
import { buyPrice, repairCost, sellPrice } from '../logic/town';
import type { GameState, ItemStack } from '../logic/types';
import { drawInfoLines, equipProblem, itemInfoLines } from './itemInfo';
import { bookBadge } from './spellText';
import { openNumberBox, type NumberBox } from './numberBox';
import { t } from './strings';
import { button, COLORS, consumePointer, iconImage, label } from './widgets';

export interface NpcSelection {
  tab: 'buy' | 'sell';
  pick: string | null; // shop row whose details are shown: item id (buy) or stack uid (sell)
  amounts: Record<string, number>; // shop: amount per row, same keys as pick
  scroll: number; // shop: first row shown
  uid: number | null; // warehouse stack selection
  from: 'bag' | 'storage';
  qty: number;
  gold: number; // warehouse: gold amount to put in / take out
}

export function newNpcSelection(): NpcSelection {
  return { tab: 'buy', pick: null, amounts: {}, scroll: 0, uid: null, from: 'bag', qty: 1, gold: 0 };
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

function grid(
  ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, x: number, y: number, cols: number, rows: number, cell: number,
  entries: { key: string | number; itemId: string; count: number; enh?: number }[], selected: string | number | null,
  onPick: (key: string | number) => void,
): void {
  const { scene } = ctx;
  for (let i = 0; i < cols * rows; i++) {
    const cx = x + (i % cols) * cell;
    const cy = y + Math.floor(i / cols) * cell;
    const e = entries[i];
    const sel = e !== undefined && e.key === selected;
    const bg = scene.add.rectangle(cx, cy, cell - 3, cell - 3, COLORS.slot).setOrigin(0)
      .setStrokeStyle(sel ? 2 : 1, sel ? COLORS.select : COLORS.slotEdge);
    c.add(bg);
    if (!e) continue;
    const def = CONTENT.items[e.itemId]!;
    c.add(iconImage(scene, cx + (cell - 3) / 2, cy + (cell - 3) / 2, def.icon, cell - 10));
    c.add(bookBadge(scene, cx + (cell - 3) / 2, cy + (cell - 3) / 2, def, cell - 10));
    if (def.stackable && e.count > 1) c.add(label(scene, cx + cell - 5, cy + cell - 4, String(e.count), { size: 10, stroke: true }).setOrigin(1, 1));
    if (e.enh) c.add(enhBadge(scene, cx + 3, cy + 1, e.enh));
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', (p: Phaser.Input.Pointer) => {
      consumePointer(scene, p);
      onPick(e.key);
    });
  }
}

/** [-10][-1] n [+1][+10][全部] */
function qtyRow(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, x: number, y: number, max: number): void {
  const { scene, sel } = ctx;
  sel.qty = Math.max(1, Math.min(sel.qty, Math.max(1, max)));
  const set = (n: number) => {
    sel.qty = Math.max(1, Math.min(n, Math.max(1, max)));
    ctx.rerender();
  };
  c.add(label(scene, x, y + 8, t('shop.qty'), { size: 13, color: '#a0a0c0' }));
  const bx = x + 40;
  c.add(button(scene, bx, y, 36, 30, '-10', () => set(sel.qty - 10), { size: 12 }).container);
  c.add(button(scene, bx + 40, y, 30, 30, '-1', () => set(sel.qty - 1), { size: 12 }).container);
  c.add(label(scene, bx + 106, y + 15, String(sel.qty), { size: 16, bold: true, align: 'center' }).setOrigin(0.5));
  c.add(button(scene, bx + 132, y, 30, 30, '+1', () => set(sel.qty + 1), { size: 12 }).container);
  c.add(button(scene, bx + 166, y, 36, 30, '+10', () => set(sel.qty + 10), { size: 12 }).container);
  c.add(button(scene, bx + 206, y, 44, 30, 'MAX', () => set(max), { size: 12 }).container);
}

/** "+N" in the top-left corner of an enhanced item's slot (as in the inventory). */
function enhBadge(scene: Phaser.Scene, x: number, y: number, enh: number): Phaser.GameObjects.Text {
  return label(scene, x, y, `+${enh}`, { size: 10, stroke: true, color: '#9fe0ff' });
}

function itemHeader(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, x: number, y: number, itemId: string, extra: string, enh = 0): void {
  const def = CONTENT.items[itemId]!;
  c.add(iconImage(ctx.scene, x + 16, y + 16, def.icon, 32));
  c.add(bookBadge(ctx.scene, x + 16, y + 16, def, 32));
  c.add(label(ctx.scene, x + 40, y, `${enh > 0 ? `+${enh} ` : ''}${t(def.nameKey)}`, { size: 15, bold: true }));
  c.add(label(ctx.scene, x + 40, y + 20, extra, { size: 12, color: '#c8c8dc', wrap: 360 }));
}

// ---------------------------------------------------------------- shop

/** Shop window height. */
export const SHOP_H = 520;
const ROW_H = 44;
const cents = (x: number): number => Math.round(x * 1000) / 1000; // see town.ts
const LIST = { x: 12, y: 76, w: 404, rows: 8 };
const PICKED_ROW = 0x2a2418; // rows with an amount are tinted

interface ShopRow {
  key: string; // item id (buy) or stack uid (sell)
  itemId: string;
  stack?: ItemStack; // sell tab
  price: number; // gold per item (sell price may be a fraction)
  sellable: boolean;
}

/**
 * Buy and sell lists: one row per item with − amount + MAX, the item's details on the right,
 * the total and one button that buys or sells everything at the bottom.
 */
export function fillShop(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, w: number, h: number): void {
  const { scene, state, sel } = ctx;
  const p = state.player;
  const b = CONTENT.balance;
  const npc = CONTENT.npcs[ctx.npcId]!;
  const stock = CONTENT.shops[npc.shop ?? '']?.items ?? [];
  const tab = (k: 'buy' | 'sell', x: number) => {
    c.add(button(scene, x, 38, 100, 30, t(`shop.${k}`), () => {
      closeEditor();
      sel.tab = k;
      sel.pick = null;
      sel.amounts = {};
      sel.scroll = 0;
      ctx.rerender();
    }, { color: sel.tab === k ? 0x6a6030 : undefined }).container);
  };
  tab('buy', 16);
  tab('sell', 122);
  c.add(label(scene, w - 16, 46, t('inv.gold', { n: p.gold }), { size: 14, color: '#ffe08a' }).setOrigin(1, 0));

  const buying = sel.tab === 'buy';
  const rows: ShopRow[] = buying
    ? stock.map((id) => ({ key: id, itemId: id, price: CONTENT.items[id]!.price, sellable: true }))
    : p.inventory.map((st) => {
      const d = CONTENT.items[st.itemId]!;
      return { key: String(st.uid), itemId: st.itemId, stack: st, price: d.price * b.sellRatio, sellable: d.price > 0 && d.kind !== 'gold' };
    });
  // Forget amounts for stacks that are gone (sold, used, dropped).
  for (const k of Object.keys(sel.amounts)) if (!rows.some((r) => r.key === k)) delete sel.amounts[k];
  const amount = (r: ShopRow) => sel.amounts[r.key] ?? 0;

  /** Most of this row the player can take: gold / weight / slots for buying, the stack for selling. */
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
      gold -= buyPrice(state, o.itemId, n);
      weight -= od.weight * n;
      slots -= od.stackable ? (p.inventory.some((st) => st.itemId === o.itemId && st.count + n <= b.maxStack) ? 0 : 1) : n;
    }
    let max = Math.min(b.maxStack, d.price > 0 ? Math.floor(cents(gold / d.price)) : b.maxStack);
    if (d.weight > 0) max = Math.min(max, Math.floor(weight / d.weight));
    if (!d.stackable) max = Math.min(max, slots);
    else if (slots < 1 && !p.inventory.some((st) => st.itemId === r.itemId && st.count < b.maxStack)) max = 0;
    return Math.max(0, max);
  };

  // ---- list (only the visible rows are drawn; scrolling redraws them)
  const { x: lx, y: ly, w: lw, rows: visible } = LIST;
  const listH = visible * ROW_H;
  c.add(scene.add.rectangle(lx, ly, lw, listH + 4, 0x15151f).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
  if (rows.length === 0) c.add(label(scene, lx + 12, ly + 12, t(buying ? 'shop.emptyBuy' : 'shop.emptySell'), { size: 13, color: '#9090a8' }));
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
      if (r.stack && d.stackable && r.stack.count > 1) rowsC.add(label(scene, lx + 39, y + 39, String(r.stack.count), { size: 10, stroke: true }).setOrigin(1, 1));
      rowsC.add(label(scene, lx + 46, y + 13, t(d.nameKey), { size: 13, color: r.sellable ? '#f0f0f0' : '#70708a' }));
      rowsC.add(label(scene, lx + 246, y + 14, String(+r.price.toFixed(2)), { size: 12, color: '#ffe08a' }).setOrigin(1, 0));
      if (!r.sellable) return;
      const minus = holdButton(scene, lx + 252, y + 6, 30, 30, '-', () => setAmount(r, amount(r) - 1));
      const plus = holdButton(scene, lx + 324, y + 6, 30, 30, '+', () => setAmount(r, amount(r) + 1));
      const max = button(scene, lx + 358, y + 6, 36, 30, 'MAX', () => setAmount(r, maxFor(r)), { size: 11 });
      // The amount: a box to type in (tap it), between - and +.
      const box = scene.add.rectangle(lx + 285, y + 6, 37, 30, 0x22223a).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge);
      box.setInteractive({ useHandCursor: true }).on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        consumePointer(scene, ptr);
        openEditor(r, box);
      });
      const qty = label(scene, lx + 303, y + 21, '', { size: 15 }).setOrigin(0.5);
      rowsC.add([minus, plus, max.container, box, qty]);
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
  const dx = lx + lw + 8;
  const dw = w - 12 - dx;
  c.add(scene.add.rectangle(dx, ly, dw, listH + 4, 0x15151f).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
  const pickRow = rows.find((r) => r.key === sel.pick);
  if (!pickRow) c.add(label(scene, dx + 10, ly + 10, t('shop.pickHint'), { size: 12, color: '#9090a8', wrap: dw - 20 }));
  else {
    const d = CONTENT.items[pickRow.itemId]!;
    const enh = pickRow.stack?.enh ?? 0;
    c.add(label(scene, dx + 10, ly + 8, `${enh > 0 ? `+${enh} ` : ''}${t(d.nameKey)}`, { size: 14, bold: true, wrap: dw - 20 }));
    const lines = itemInfoLines(p, d, enh, d.weapon ? pickRow.stack?.dur : undefined);
    if (buying) lines.push({ text: t('shop.owned', { n: countItem(p, pickRow.itemId) }) });
    const problem = equipProblem(p, d);
    if (problem) lines.push({ text: problem });
    drawInfoLines(scene, c, dx + 10, ly + 30, lines, { size: 12, color: problem ? '#ffb0a0' : '#c8c8dc', wrap: dw - 20, onHelp: ctx.message });
  }

  // ---- bottom: total, buy / sell everything, clear
  const by = ly + listH + 12;
  const bh = h - 12 - by;
  c.add(scene.add.rectangle(12, by, w - 24, bh, 0x1c1a24).setOrigin(0).setStrokeStyle(1, 0xff9040));
  const totalText = label(scene, 26, by + 12, '', { size: 15, color: '#ffe08a' });
  const subText = label(scene, 26, by + 36, '', { size: 12, color: '#c0c0d8' });
  c.add([totalText, subText]);
  const go = button(scene, w - 262, by + (bh - 46) / 2, 150, 46, t(buying ? 'shop.buyAll' : 'shop.sellAll'), () => {
    closeEditor();
    const picked = rows.filter((r) => amount(r) > 0);
    if (buying) ctx.issue({ type: 'buyMany', npcId: ctx.npcId, items: picked.map((r) => ({ itemId: r.itemId, count: amount(r) })) });
    else ctx.issue({ type: 'sellMany', npcId: ctx.npcId, items: picked.map((r) => ({ uid: Number(r.key), count: amount(r) })) });
    sel.amounts = {};
    refresh();
  }, { size: 17 });
  const clear = button(scene, w - 104, by + (bh - 46) / 2, 80, 46, t('shop.clear'), () => {
    closeEditor();
    sel.amounts = {};
    refresh();
  }, { size: 14 });
  c.add([go.container, clear.container]);

  function refresh(): void {
    for (const { text, bg, row } of qtyTexts.values()) {
      const n = amount(row);
      text.setText(String(n)).setColor(n > 0 ? '#ffffff' : '#66667a');
      bg.setFillStyle(n > 0 ? PICKED_ROW : 0x15151f);
    }
    const picked = rows.filter((r) => amount(r) > 0);
    const count = picked.reduce((n, r) => n + amount(r), 0);
    const total = buying
      ? picked.reduce((n, r) => n + buyPrice(state, r.itemId, amount(r)), 0)
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

export function fillWarehouse(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, _w: number, h: number): void {
  const { scene, state, sel } = ctx;
  const p = state.player;
  const b = CONTENT.balance;
  const cell = 29;
  c.add(label(scene, 16, 40, t('wh.bag'), { size: 13, color: '#a0a0c0' }));
  const store = state.shared;
  c.add(label(scene, 320, 40, t('wh.storage', { n: store.items.length, max: b.warehouseSlots }), { size: 13, color: '#a0a0c0' }));
  const pick = (from: 'bag' | 'storage') => (k: string | number) => {
    sel.from = from;
    sel.uid = Number(k);
    sel.qty = 1;
    ctx.rerender();
  };
  grid(ctx, c, 16, 60, 10, 6, cell, p.inventory.map((st) => ({ key: st.uid, itemId: st.itemId, count: st.count, enh: st.enh })),
    sel.from === 'bag' ? sel.uid : null, pick('bag'));
  grid(ctx, c, 320, 60, 10, 10, cell, store.items.map((st) => ({ key: st.uid, itemId: st.itemId, count: st.count, enh: st.enh })),
    sel.from === 'storage' ? sel.uid : null, pick('storage'));

  // Gold: put in for free, take out for the fee (paid from the gold taken out).
  const fee = b.warehouseFee;
  const gy = 60 + 10 * cell + 8;
  c.add(label(scene, 320, gy, t('wh.gold', { n: store.gold.toLocaleString('en'), mine: p.gold.toLocaleString('en') }), { size: 13, color: '#ffe08a' }));
  const goldBox = scene.add.rectangle(320, gy + 22, 80, 30, 0x22223a).setOrigin(0).setStrokeStyle(2, 0x6a6aa0);
  goldBox.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
    openNumberBox(scene, goldBox, { value: sel.gold, max: Math.max(p.gold, store.gold), onClose: (n) => {
      sel.gold = n;
      ctx.rerender();
    } });
  });
  c.add([goldBox, label(scene, 360, gy + 37, String(sel.gold), { size: 15 }).setOrigin(0.5)]);
  c.add(button(scene, 406, gy + 22, 56, 30, t('wh.goldIn'), () => ctx.issue({ type: 'depositGold', npcId: ctx.npcId, amount: sel.gold }),
    { size: 13, enabled: sel.gold > 0 && p.gold > 0 }).container);
  c.add(button(scene, 466, gy + 22, 56, 30, t('wh.goldOut'), () => ctx.issue({ type: 'withdrawGold', npcId: ctx.npcId, amount: sel.gold }),
    { size: 13, enabled: sel.gold > 0 && store.gold > 0 }).container);
  c.add(button(scene, 526, gy + 22, 76, 30, t('wh.goldAllIn'), () => ctx.issue({ type: 'depositGold', npcId: ctx.npcId, amount: p.gold }),
    { size: 13, enabled: p.gold > 0 }).container);

  const dy = 60 + 6 * cell + 10;
  c.add(scene.add.rectangle(12, dy, 296, h - dy - 12, 0x15151f).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
  const list = sel.from === 'bag' ? p.inventory : store.items;
  const st = list.find((x) => x.uid === sel.uid);
  if (!st) {
    c.add(label(scene, 22, dy + 10, t('wh.pick'), { size: 13, color: '#9090a8', wrap: 270 }));
    return;
  }
  itemHeader(ctx, c, 20, dy + 8, st.itemId, `×${st.count}`, st.enh);
  if (st.count > 1) qtyRow(ctx, c, 20, dy + 60, st.count);
  else sel.qty = 1;
  const putIn = sel.from === 'bag';
  c.add(button(scene, 20, dy + 104, 160, 38, putIn ? t('wh.deposit') : t('wh.withdrawFee', { fee }), () => {
    ctx.issue({ type: putIn ? 'deposit' : 'withdraw', npcId: ctx.npcId, uid: st.uid, count: sel.qty });
    if (sel.qty >= st.count) sel.uid = null;
  }, { enabled: putIn || p.gold >= fee }).container);
}

// ---------------------------------------------------------------- blacksmith

export function fillSmith(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, w: number, h: number): void {
  const { scene, state } = ctx;
  const p = state.player;
  c.add(label(scene, 16, 40, t('smith.hint'), { size: 13, color: '#c8c8dc', wrap: w - 32 }));
  c.add(label(scene, w - 16, 40, t('inv.gold', { n: p.gold }), { size: 14, color: '#ffe08a' }).setOrigin(1, 0));
  const weapons: { st: ItemStack; equipped: boolean }[] = [];
  if (p.equipment.weapon) weapons.push({ st: p.equipment.weapon, equipped: true });
  for (const st of p.inventory) if (CONTENT.items[st.itemId]?.weapon) weapons.push({ st, equipped: false });
  let total = 0;
  weapons.slice(0, 7).forEach(({ st, equipped }, i) => {
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
