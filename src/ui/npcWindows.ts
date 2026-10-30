// Windows opened by village NPCs: shop (buy/sell), warehouse, blacksmith. They only send
// Commands; the logic checks gold, weight, slots and that the player stands next to the NPC.
import Phaser from 'phaser';
import { CONTENT } from '../content';
import type { Command } from '../logic/commands';
import { countItem } from '../logic/inventory';
import { repairCost, sellPrice } from '../logic/town';
import type { GameState, ItemStack } from '../logic/types';
import { drawInfoLines, equipProblem, itemInfoLines } from './itemInfo';
import { bookBadge } from './spellText';
import { t } from './strings';
import { button, COLORS, consumePointer, iconImage, label } from './widgets';

export interface NpcSelection {
  tab: 'buy' | 'sell';
  itemId: string | null; // shop stock selection (buy tab)
  uid: number | null; // stack selection (sell tab, warehouse)
  from: 'bag' | 'storage';
  qty: number;
  basket: { key: string | number; itemId: string; count: number }[]; // shop: itemId (buy) or stack uid (sell)
}

export function newNpcSelection(): NpcSelection {
  return { tab: 'buy', itemId: null, uid: null, from: 'bag', qty: 1, basket: [] };
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

/** Re-render whenever any of this changes. */
export function npcWindowSignature(s: GameState, sel: NpcSelection): string {
  const p = s.player;
  const stacks = (a: ItemStack[]) => a.map((i) => `${i.uid}:${i.count}:${i.dur}`).join(',');
  return `${JSON.stringify(sel)}|${p.gold}|${stacks(p.inventory)}|${stacks(p.warehouse)}|${p.equipment.weapon?.dur ?? '-'}`;
}

// ---------------------------------------------------------------- shared pieces

function grid(
  ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, x: number, y: number, cols: number, rows: number, cell: number,
  entries: { key: string | number; itemId: string; count: number }[], selected: string | number | null,
  onPick: (key: string | number) => void, marked: Set<string | number> = new Set(),
): void {
  const { scene } = ctx;
  for (let i = 0; i < cols * rows; i++) {
    const cx = x + (i % cols) * cell;
    const cy = y + Math.floor(i / cols) * cell;
    const e = entries[i];
    const sel = e !== undefined && e.key === selected;
    const mark = e !== undefined && marked.has(e.key);
    const bg = scene.add.rectangle(cx, cy, cell - 3, cell - 3, COLORS.slot).setOrigin(0)
      .setStrokeStyle(sel || mark ? 2 : 1, sel ? COLORS.select : mark ? BASKET_COLOR : COLORS.slotEdge);
    c.add(bg);
    if (!e) continue;
    const def = CONTENT.items[e.itemId]!;
    c.add(iconImage(scene, cx + (cell - 3) / 2, cy + (cell - 3) / 2, def.icon, cell - 10));
    c.add(bookBadge(scene, cx + (cell - 3) / 2, cy + (cell - 3) / 2, def, cell - 10));
    if (def.stackable && e.count > 1) c.add(label(scene, cx + cell - 5, cy + cell - 4, String(e.count), { size: 10, stroke: true }).setOrigin(1, 1));
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

function itemHeader(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, x: number, y: number, itemId: string, extra: string): void {
  const def = CONTENT.items[itemId]!;
  c.add(iconImage(ctx.scene, x + 16, y + 16, def.icon, 32));
  c.add(bookBadge(ctx.scene, x + 16, y + 16, def, 32));
  c.add(label(ctx.scene, x + 40, y, t(def.nameKey), { size: 15, bold: true }));
  c.add(label(ctx.scene, x + 40, y + 20, extra, { size: 12, color: '#c8c8dc', wrap: 360 }));
}

// ---------------------------------------------------------------- shop

/** Shop window height (taller than the other panels: it has a basket row). */
export const SHOP_H = 520;
const BASKET_COLOR = 0xff9040;

/**
 * Buy and sell work with a basket: pick an item, set the amount, add it; then buy or sell the
 * whole basket with one button. Tapping something in the basket takes it out.
 */
export function fillShop(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, w: number, h: number): void {
  const { scene, state, sel } = ctx;
  const p = state.player;
  const npc = CONTENT.npcs[ctx.npcId]!;
  const stock = CONTENT.shops[npc.shop ?? '']?.items ?? [];
  const tab = (k: 'buy' | 'sell', x: number) => {
    c.add(button(scene, x, 38, 100, 30, t(`shop.${k}`), () => {
      sel.tab = k;
      sel.itemId = null;
      sel.uid = null;
      sel.qty = 1;
      sel.basket = [];
      ctx.rerender();
    }, { color: sel.tab === k ? 0x6a6030 : undefined }).container);
  };
  tab('buy', 16);
  tab('sell', 122);
  c.add(label(scene, w - 16, 46, t('inv.gold', { n: p.gold }), { size: 14, color: '#ffe08a' }).setOrigin(1, 0));

  // Drop basket lines whose stack is gone (sold, used, dropped) or shrank.
  if (sel.tab === 'sell') {
    sel.basket = sel.basket.flatMap((b) => {
      const st = p.inventory.find((x) => x.uid === b.key);
      return st ? [{ ...b, count: Math.min(b.count, st.count) }] : [];
    });
  }

  const gy = 76;
  const cols = 14;
  // The buy grid is only as tall as the stock, leaving room for the item's details.
  const rows = sel.tab === 'buy' ? Math.min(5, Math.max(1, Math.ceil(stock.length / cols))) : 5;
  const dy = gy + rows * 41 + 6;
  const by = gy + 5 * 41 + 6 + 112;
  c.add(scene.add.rectangle(12, dy, w - 24, by - dy - 6, 0x15151f).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));

  if (sel.tab === 'buy') {
    grid(ctx, c, 16, gy, cols, rows, 41, stock.map((id) => ({ key: id, itemId: id, count: 1 })), sel.itemId, (k) => {
      sel.itemId = String(k);
      sel.qty = 1;
      ctx.rerender();
    });
    if (!sel.itemId) c.add(label(scene, 24, dy + 12, t('shop.pickBuy'), { size: 14, color: '#9090a8' }));
    else {
      const def = CONTENT.items[sel.itemId]!;
      itemHeader(ctx, c, 24, dy + 8, sel.itemId, [t('shop.price', { n: def.price }), t('shop.owned', { n: countItem(p, sel.itemId) })].join('\u3000'));
      // Details (damage, defense, requirements...), then the amount and the add button at the bottom.
      const problem = equipProblem(p, def);
      const lines = itemInfoLines(p, def, 0);
      if (problem) lines.push({ text: problem });
      drawInfoLines(scene, c, 64, dy + 46, lines, { size: 12, color: problem ? '#ffb0a0' : '#c8c8dc', wrap: w - 100, onHelp: ctx.message });
      const ry = Math.max(dy + 66, by - 50);
      qtyRow(ctx, c, 24, ry, 999);
      c.add(button(scene, w - 160, ry - 4, 140, 38, t('shop.addBuy'), () => {
        const line = sel.basket.find((b) => b.key === sel.itemId);
        if (line) line.count += sel.qty;
        else sel.basket.push({ key: sel.itemId!, itemId: sel.itemId!, count: sel.qty });
        sel.qty = 1;
        ctx.rerender();
      }).container);
    }
    const total = sel.basket.reduce((n, b) => n + CONTENT.items[b.itemId]!.price * b.count, 0);
    basketRow(ctx, c, w, by, h, total, total > p.gold, t('shop.checkout'), () => {
      ctx.issue({ type: 'buyMany', npcId: ctx.npcId, items: sel.basket.map((b) => ({ itemId: b.itemId, count: b.count })) });
      sel.basket = [];
    });
    return;
  }

  // sell: items already in the basket get an orange frame
  grid(ctx, c, 16, gy, 14, rows, 41, p.inventory.map((st) => ({ key: st.uid, itemId: st.itemId, count: st.count })), sel.uid, (k) => {
    sel.uid = Number(k);
    const st = p.inventory.find((x) => x.uid === sel.uid);
    sel.qty = st?.count ?? 1; // default: the whole stack
    ctx.rerender();
  }, new Set(sel.basket.map((b) => b.key)));
  const st = p.inventory.find((x) => x.uid === sel.uid);
  if (!st) c.add(label(scene, 24, dy + 12, t('shop.pickSell'), { size: 14, color: '#9090a8' }));
  else {
    const each = CONTENT.items[st.itemId]!.price * CONTENT.balance.sellRatio; // may be a fraction (arrows)
    itemHeader(ctx, c, 24, dy + 8, st.itemId, `${t('shop.sellEach', { n: +each.toFixed(2) })}\u3000×${st.count}`);
    if (st.count > 1) qtyRow(ctx, c, 24, dy + 66, st.count);
    else sel.qty = 1;
    const sellable = CONTENT.items[st.itemId]!.price > 0 && CONTENT.items[st.itemId]!.kind !== 'gold';
    c.add(button(scene, w - 160, dy + 62, 140, 38, t('shop.addSell'), () => {
      const line = sel.basket.find((b) => b.key === st.uid);
      if (line) line.count = sel.qty;
      else sel.basket.push({ key: st.uid, itemId: st.itemId, count: sel.qty });
      sel.uid = null;
      ctx.rerender();
    }, { enabled: sellable }).container);
  }
  const total = sel.basket.reduce((n, b) => n + sellPrice(state, b.itemId, b.count), 0);
  basketRow(ctx, c, w, by, h, total, false, t('shop.sellAll'), () => {
    ctx.issue({ type: 'sellMany', npcId: ctx.npcId, items: sel.basket.map((b) => ({ uid: Number(b.key), count: b.count })) });
    sel.basket = [];
    sel.uid = null;
  });
}

/** The basket: small icons with amounts (tap one to take it out), the total, and the action button. */
function basketRow(
  ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, w: number, y: number, h: number,
  total: number, tooMuch: boolean, action: string, onAction: () => void,
): void {
  const { scene, sel } = ctx;
  c.add(scene.add.rectangle(12, y, w - 24, h - y - 12, 0x1c1a24).setOrigin(0).setStrokeStyle(1, BASKET_COLOR));
  c.add(label(scene, 22, y + 6, t(sel.tab === 'buy' ? 'shop.basketBuy' : 'shop.basketSell', { n: sel.basket.length }), { size: 13, color: '#ffc080' }));
  const cell = 38;
  const perRow = Math.floor((w - 220) / cell);
  if (sel.basket.length === 0) {
    c.add(label(scene, 22, y + 34, t(sel.tab === 'buy' ? 'shop.basketEmptyBuy' : 'shop.basketEmptySell'), { size: 12, color: '#9090a8', wrap: w - 240 }));
  }
  sel.basket.slice(0, perRow * 2).forEach((b, i) => {
    const cx = 22 + (i % perRow) * cell;
    const cy = y + 26 + Math.floor(i / perRow) * cell;
    const bg = scene.add.rectangle(cx, cy, cell - 4, cell - 4, COLORS.slot).setOrigin(0).setStrokeStyle(1, BASKET_COLOR);
    c.add(bg);
    const def = CONTENT.items[b.itemId]!;
    c.add(iconImage(scene, cx + (cell - 4) / 2, cy + (cell - 4) / 2, def.icon, cell - 10));
    c.add(bookBadge(scene, cx + (cell - 4) / 2, cy + (cell - 4) / 2, def, cell - 10));
    if (b.count > 1) c.add(label(scene, cx + cell - 6, cy + cell - 5, String(b.count), { size: 10, stroke: true }).setOrigin(1, 1));
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', (p: Phaser.Input.Pointer) => {
      consumePointer(scene, p);
      sel.basket.splice(sel.basket.indexOf(b), 1);
      ctx.rerender();
    });
  });
  if (sel.basket.length > perRow * 2) c.add(label(scene, w - 190, y + 6, `+${sel.basket.length - perRow * 2}`, { size: 12 }).setOrigin(1, 0));
  c.add(label(scene, w - 22, y + 8, t('shop.total', { n: total }), { size: 14, color: tooMuch ? '#ff8a7a' : '#ffe08a' }).setOrigin(1, 0));
  c.add(button(scene, w - 172, y + 34, 150, 44, action, onAction, { size: 16, enabled: sel.basket.length > 0 && !tooMuch }).container);
}

// ---------------------------------------------------------------- warehouse

export function fillWarehouse(ctx: NpcWindowCtx, c: Phaser.GameObjects.Container, _w: number, h: number): void {
  const { scene, state, sel } = ctx;
  const p = state.player;
  const b = CONTENT.balance;
  const cell = 29;
  c.add(label(scene, 16, 40, t('wh.bag'), { size: 13, color: '#a0a0c0' }));
  c.add(label(scene, 320, 40, t('wh.storage', { n: p.warehouse.length, max: b.warehouseSlots }), { size: 13, color: '#a0a0c0' }));
  const pick = (from: 'bag' | 'storage') => (k: string | number) => {
    sel.from = from;
    sel.uid = Number(k);
    sel.qty = 1;
    ctx.rerender();
  };
  grid(ctx, c, 16, 60, 10, 6, cell, p.inventory.map((st) => ({ key: st.uid, itemId: st.itemId, count: st.count })),
    sel.from === 'bag' ? sel.uid : null, pick('bag'));
  grid(ctx, c, 320, 60, 10, 10, cell, p.warehouse.map((st) => ({ key: st.uid, itemId: st.itemId, count: st.count })),
    sel.from === 'storage' ? sel.uid : null, pick('storage'));

  const dy = 60 + 6 * cell + 10;
  c.add(scene.add.rectangle(12, dy, 296, h - dy - 12, 0x15151f).setOrigin(0).setStrokeStyle(1, COLORS.slotEdge));
  const list = sel.from === 'bag' ? p.inventory : p.warehouse;
  const st = list.find((x) => x.uid === sel.uid);
  if (!st) {
    c.add(label(scene, 22, dy + 10, t('wh.pick'), { size: 13, color: '#9090a8', wrap: 270 }));
    return;
  }
  itemHeader(ctx, c, 20, dy + 8, st.itemId, `×${st.count}`);
  if (st.count > 1) qtyRow(ctx, c, 20, dy + 60, st.count);
  else sel.qty = 1;
  const store = sel.from === 'bag';
  c.add(button(scene, 20, dy + 104, 130, 38, t(store ? 'wh.deposit' : 'wh.withdraw'), () => {
    ctx.issue({ type: store ? 'deposit' : 'withdraw', npcId: ctx.npcId, uid: st.uid, count: sel.qty });
    if (sel.qty >= st.count) sel.uid = null;
  }).container);
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
