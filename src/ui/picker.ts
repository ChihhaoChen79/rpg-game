// A pop-up list to choose one option (the ▾ boxes in the auto-hunt settings): a title, rows with
// an optional icon, ▲ ▼ to page through long lists, ✕ to cancel.
import Phaser from 'phaser';
import { blockInput, button, COLORS, iconImage, label } from './widgets';

export interface PickerOption<T> {
  label: string;
  icon?: string;
  value: T;
}

const ROW_H = 38;
const ROWS = 8;
const W = 380;

export function openPicker<T>(
  scene: Phaser.Scene, cx: number, cy: number, title: string, options: PickerOption<T>[],
  isCurrent: (v: T) => boolean, onPick: (v: T) => void,
): Phaser.GameObjects.Container {
  const shade = scene.add.rectangle(-4000, -4000, 12000, 12000, 0x000000, 0.55).setOrigin(0);
  blockInput(scene, shade);
  const c = scene.add.container(0, 0, [shade]).setDepth(1000);
  const pages = Math.max(1, Math.ceil(options.length / ROWS));
  const h = 44 + Math.min(ROWS, options.length) * ROW_H + (pages > 1 ? 44 : 8);
  const x = cx - W / 2;
  const y = cy - h / 2;
  const frame = scene.add.rectangle(x, y, W, h, COLORS.panel, 0.98).setOrigin(0).setStrokeStyle(2, COLORS.panelEdge);
  blockInput(scene, frame);
  c.add([frame, label(scene, x + 12, y + 12, title, { size: 15, bold: true })]);
  c.add(button(scene, x + W - 32, y + 6, 26, 26, '✕', () => c.destroy(), { size: 13 }).container);
  const start = Math.max(0, options.findIndex((o) => isCurrent(o.value)));
  let page = Math.floor(start / ROWS);
  const rowsC = scene.add.container(0, 0);
  c.add(rowsC);
  const draw = () => {
    rowsC.removeAll(true);
    options.slice(page * ROWS, page * ROWS + ROWS).forEach((o, i) => {
      const ry = y + 40 + i * ROW_H;
      const on = isCurrent(o.value);
      const bg = scene.add.rectangle(x + 8, ry, W - 16, ROW_H - 4, on ? 0x3a3a20 : COLORS.slot).setOrigin(0)
        .setStrokeStyle(on ? 2 : 1, on ? COLORS.select : COLORS.slotEdge);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        c.destroy();
        onPick(o.value);
      });
      rowsC.add(bg);
      if (o.icon) rowsC.add(iconImage(scene, x + 26, ry + (ROW_H - 4) / 2, o.icon, 26));
      rowsC.add(label(scene, x + (o.icon ? 46 : 16), ry + (ROW_H - 4) / 2, o.label, { size: 14 }).setOrigin(0, 0.5));
    });
    if (pages > 1) rowsC.add(label(scene, cx, y + h - 22, `${page + 1} / ${pages}`, { size: 13, color: '#a0a0c0' }).setOrigin(0.5));
  };
  if (pages > 1) {
    c.add(button(scene, x + 12, y + h - 38, 60, 30, '▲', () => {
      page = (page + pages - 1) % pages;
      draw();
    }, { size: 14 }).container);
    c.add(button(scene, x + W - 72, y + h - 38, 60, 30, '▼', () => {
      page = (page + 1) % pages;
      draw();
    }, { size: 14 }).container);
  }
  draw();
  return c;
}
