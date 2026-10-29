// Small UI building blocks (Phaser game objects) shared by the HUD, panels and menu scenes.
// Sizes are logical px; text is rendered at the camera zoom so it stays sharp.
import Phaser from 'phaser';
import { UI_FONT } from './strings';

export const COLORS = {
  panel: 0x1d1d2b,
  panelEdge: 0x6d6a8c,
  panelTitle: 0x2c2a44,
  button: 0x3a3760,
  buttonHover: 0x4d4a7d,
  buttonDisabled: 0x2a2a36,
  slot: 0x26253a,
  slotEdge: 0x55537a,
  select: 0xffd860,
  hp: 0xd23c3c,
  mp: 0x3c6ed2,
  exp: 0xe0b040,
  barBg: 0x101018,
};

/** Text resolution (set from the layout zoom) so text isn't blurry when the camera zooms. */
let textResolution = 1;
export function setTextResolution(r: number): void {
  textResolution = Math.max(1, Math.min(4, r));
}

export interface TextOpts {
  size?: number;
  color?: string;
  bold?: boolean;
  stroke?: boolean;
  wrap?: number;
  align?: 'left' | 'center' | 'right';
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const tx = scene.add.text(x, y, text, {
    fontFamily: UI_FONT,
    fontSize: `${o.size ?? 14}px`,
    fontStyle: o.bold ? 'bold' : 'normal',
    color: o.color ?? '#f0f0f0',
    stroke: o.stroke ? '#000000' : undefined,
    strokeThickness: o.stroke ? 3 : 0,
    align: o.align ?? 'left',
    wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
    resolution: textResolution,
  });
  return tx;
}

/**
 * Marks this pointer press as handled by the UI, so the world scene underneath ignores it.
 * (The HUD scene is above the world scene, so its handlers run first.)
 */
export function consumePointer(scene: Phaser.Scene, p: Phaser.Input.Pointer): void {
  scene.registry.set('uiPointerDown', `${p.id}:${p.downTime}`);
}

export function pointerConsumed(scene: Phaser.Scene, p: Phaser.Input.Pointer): boolean {
  return scene.registry.get('uiPointerDown') === `${p.id}:${p.downTime}`;
}

/** Makes a game object swallow presses so they don't reach the world. */
export function blockInput(scene: Phaser.Scene, obj: Phaser.GameObjects.GameObject): void {
  obj.setInteractive();
  obj.on('pointerdown', (p: Phaser.Input.Pointer) => consumePointer(scene, p));
}

export interface Button {
  container: Phaser.GameObjects.Container;
  setEnabled(on: boolean): void;
  setLabel(text: string): void;
}

export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string, onClick: () => void,
  o: { size?: number; enabled?: boolean; color?: number } = {},
): Button {
  const base = o.color ?? COLORS.button;
  const bg = scene.add.rectangle(0, 0, w, h, base).setOrigin(0).setStrokeStyle(1, COLORS.panelEdge);
  const tx = label(scene, w / 2, h / 2, text, { size: o.size ?? 15, align: 'center' }).setOrigin(0.5);
  const c = scene.add.container(x, y, [bg, tx]);
  let enabled = o.enabled ?? true;
  const paint = () => {
    bg.setFillStyle(enabled ? base : COLORS.buttonDisabled);
    tx.setAlpha(enabled ? 1 : 0.45);
  };
  paint();
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerover', () => enabled && bg.setFillStyle(COLORS.buttonHover));
  bg.on('pointerout', paint);
  bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
    consumePointer(scene, p);
    if (enabled) onClick();
  });
  return {
    container: c,
    setEnabled(on) {
      enabled = on;
      paint();
    },
    setLabel(text2) {
      tx.setText(text2);
    },
  };
}

export interface Bar {
  set(frac: number, text?: string, color?: number): void;
  objects: Phaser.GameObjects.GameObject[];
}

export function bar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number, textSize = 11): Bar {
  const bg = scene.add.rectangle(x, y, w, h, COLORS.barBg).setOrigin(0).setStrokeStyle(1, 0x000000);
  const fill = scene.add.rectangle(x + 1, y + 1, w - 2, h - 2, color).setOrigin(0);
  const tx = label(scene, x + w / 2, y + h / 2, '', { size: textSize, stroke: true, align: 'center' }).setOrigin(0.5);
  return {
    objects: [bg, fill, tx],
    set(frac, text, color) {
      fill.width = Math.max(0, Math.min(1, frac)) * (w - 2);
      if (color !== undefined && fill.fillColor !== color) fill.setFillStyle(color);
      if (text !== undefined) tx.setText(text);
    },
  };
}

/** A window frame with a title and close button. Returns the container; add content at y >= 36. */
export function panelFrame(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, title: string, onClose: () => void,
): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, w, h, COLORS.panel, 0.97).setOrigin(0).setStrokeStyle(2, COLORS.panelEdge);
  blockInput(scene, bg);
  const head = scene.add.rectangle(0, 0, w, 30, COLORS.panelTitle).setOrigin(0);
  const tl = label(scene, 12, 15, title, { size: 16, bold: true }).setOrigin(0, 0.5);
  const close = button(scene, w - 30, 3, 26, 24, '✕', onClose, { size: 14 });
  return scene.add.container(x, y, [bg, head, tl, close.container]);
}

export function iconTexture(icon: string): string {
  return `icon-${icon}`;
}

export function iconImage(scene: Phaser.Scene, x: number, y: number, icon: string, size = 32): Phaser.GameObjects.Image {
  return scene.add.image(x, y, iconTexture(icon)).setDisplaySize(size, size);
}
