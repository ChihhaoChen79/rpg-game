import Phaser from 'phaser';
import pixelFontUrl from '../../assets/fonts/fusion-pixel-tc-subset.woff2?url';
import { PIXEL_FONT } from '../ui/strings';
import tilesetUrl from '../../assets/tilesets/placeholder.png';
import { CONTENT, TILED_MAPS } from '../content';
import { iconTexture } from '../ui/widgets';
import { layerTexture, LPC_FRAME } from './character';

export const TEX_TILES = 'tiles';
/** Name of the tileset inside the Tiled maps, and its extrusion (see tools/tileset-def.mjs). */
export const TILESET_NAME = 'placeholder';
export const TILESET_MARGIN = 1;
export const TILESET_SPACING = 2;

// Every PNG in these folders is bundled; the file name is the layer / sprite name used in data/.
const CHARACTER_SHEETS = import.meta.glob<string>('../../assets/sprites/characters/*.png', { eager: true, query: '?url', import: 'default' });
const ICONS = import.meta.glob<string>('../../assets/sprites/icons/*.png', { eager: true, query: '?url', import: 'default' });
const MONSTER_SHEETS = import.meta.glob<string>('../../assets/sprites/monsters/*.png', { eager: true, query: '?url', import: 'default' });

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.png'.length);

/** Monster sheet: 4 columns x 3 rows (move, attack, die), facing right. */
export const MONSTER_FRAMES = 4;
export function monsterTexture(sprite: string): string {
  return `monster-${sprite}`;
}
export function monsterAnim(sprite: string, anim: 'move' | 'attack' | 'die'): string {
  return `monster-${sprite}-${anim}`;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image(TEX_TILES, tilesetUrl);
    for (const [path, url] of Object.entries(ICONS)) this.load.image(iconTexture(baseName(path)), url);
    for (const [path, url] of Object.entries(CHARACTER_SHEETS)) {
      this.load.spritesheet(layerTexture(baseName(path)), url, { frameWidth: LPC_FRAME, frameHeight: LPC_FRAME });
    }
    for (const [path, url] of Object.entries(MONSTER_SHEETS)) {
      const name = baseName(path);
      const frame = Object.values(CONTENT.monsters).find((m) => m.sprite === name)?.frame ?? 64;
      this.load.spritesheet(monsterTexture(name), url, { frameWidth: frame, frameHeight: frame });
    }
    for (const [id, data] of Object.entries(TILED_MAPS)) this.load.tilemapTiledJSON(id, data);
  }

  create(): void {
    for (const m of Object.values(CONTENT.monsters)) {
      const tex = monsterTexture(m.sprite);
      if (this.anims.exists(monsterAnim(m.sprite, 'move')) || !this.textures.exists(tex)) continue;
      const row = (r: number) => this.anims.generateFrameNumbers(tex, { start: r * MONSTER_FRAMES, end: r * MONSTER_FRAMES + MONSTER_FRAMES - 1 });
      this.anims.create({ key: monsterAnim(m.sprite, 'move'), frames: row(0), frameRate: 6, repeat: -1 });
      this.anims.create({ key: monsterAnim(m.sprite, 'attack'), frames: row(1), frameRate: 12 });
      this.anims.create({ key: monsterAnim(m.sprite, 'die'), frames: row(2), frameRate: 8 });
    }
    // Text is drawn into canvases, so the font must be loaded before any scene draws text.
    // If it fails or is slow (offline first run), carry on with the system font.
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      this.scene.start('Title');
    };
    const face = new FontFace(PIXEL_FONT, `url(${pixelFontUrl})`);
    face.load().then((f) => document.fonts.add(f)).catch((e: unknown) => console.warn('Pixel font not loaded', e)).finally(start);
    this.time.delayedCall(4000, start);
  }
}
