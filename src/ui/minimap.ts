// Minimap (plan §6, top-right of the map view): a small picture of the current map with
// walls, safe zone and exits, plus dots for the player, monsters and NPCs. Toggle: M key or 設定.
import Phaser from 'phaser';
import type { GameState, MapData } from '../logic/types';

const MAX_W = 180; // logical px
const MAX_H = 140;
const COLORS = {
  floor: '#3f6a3a', blocked: '#1e2a1e', safe: '#5a7aa8', exit: '#e8d860',
  frame: 0x000000, player: 0xffffff, monster: 0xff5050, npc: 0xffd060,
};
const PREF_KEY = 'rpg-game:minimap';

/** Remembered on this device only (a display preference, not game state). */
export function minimapPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setMinimapPref(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the setting just won't be remembered
  }
}

export interface Minimap {
  objects: Phaser.GameObjects.GameObject[];
  update(s: GameState, visible: boolean): void;
}

/** Minimap whose top-right corner is at (right, top). */
export function createMinimap(scene: Phaser.Scene, right: number, top: number): Minimap {
  const bg = scene.add.rectangle(right, top, 10, 10, COLORS.frame, 0.55).setOrigin(1, 0).setStrokeStyle(1, 0x8080a0);
  const img = scene.add.image(right - 3, top + 3, '__DEFAULT').setOrigin(1, 0);
  const dots = scene.add.graphics();
  let mapId = '';
  let scale = 1;
  let w = 0;
  let h = 0;

  const rebuild = (m: MapData) => {
    scale = Math.max(1, Math.floor(Math.min(MAX_W / m.width, MAX_H / m.height)));
    w = m.width * scale;
    h = m.height * scale;
    const key = `minimap-${m.id}`;
    if (!scene.textures.exists(key)) {
      const tex = scene.textures.createCanvas(key, m.width, m.height)!;
      const ctx = tex.getContext();
      for (let y = 0; y < m.height; y++) {
        for (let x = 0; x < m.width; x++) {
          const i = y * m.width + x;
          ctx.fillStyle = m.blocked[i] ? COLORS.blocked : m.safe[i] ? COLORS.safe : COLORS.floor;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.fillStyle = COLORS.exit;
      for (const e of m.exits) ctx.fillRect(e.x, e.y, e.w, e.h);
      tex.refresh();
    }
    img.setTexture(key).setDisplaySize(w, h);
    bg.setSize(w + 6, h + 6);
    bg.setDisplaySize(w + 6, h + 6);
  };

  return {
    objects: [bg, img, dots],
    update(s, visible) {
      bg.setVisible(visible);
      img.setVisible(visible);
      dots.setVisible(visible);
      if (!visible) return;
      const m = s.maps[s.mapId]!;
      if (m.id !== mapId) {
        mapId = m.id;
        rebuild(m);
      }
      const ox = right - 3 - w;
      const oy = top + 3;
      const dot = (x: number, y: number, size: number) => dots.fillRect(ox + (x + 0.5) * scale - size / 2, oy + (y + 0.5) * scale - size / 2, size, size);
      dots.clear();
      dots.fillStyle(COLORS.npc);
      for (const n of m.npcs) dot(n.x, n.y, Math.max(2, scale));
      dots.fillStyle(COLORS.monster);
      for (const mo of s.monsters) if (!mo.dead) dot(mo.mover.x, mo.mover.y, Math.max(2, scale));
      dots.fillStyle(COLORS.player);
      dot(s.player.mover.x, s.player.mover.y, Math.max(3, scale + 1));
    },
  };
}
