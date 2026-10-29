import Phaser from 'phaser';
import tilesetUrl from '../../assets/tilesets/placeholder.png';
import classesUrl from '../../assets/sprites/classes.png';
import monstersUrl from '../../assets/sprites/monsters.png';
import npcsUrl from '../../assets/sprites/npcs.png';
import iconsUrl from '../../assets/sprites/icons.png';
import { CONTENT, GAME_CONFIG, TILED_MAPS } from '../content';
import { TICK_MS } from '../logic/time';
import { CLASS_IDS, Facing, type ClassId } from '../logic/types';

export const TEX_TILES = 'tiles';
export const TEX_CLASSES = 'classes';
export const TEX_MONSTERS = 'monsters';
export const TEX_NPCS = 'npcs';
export const TEX_ICONS = 'icons';
/** Name of the tileset inside the Tiled maps, and its extrusion (see tools/tileset-def.mjs). */
export const TILESET_NAME = 'placeholder';
export const TILESET_MARGIN = 1;
export const TILESET_SPACING = 2;

const FACING_NAMES = ['down', 'left', 'right', 'up'] as const;

export function walkAnimKey(cls: ClassId, f: Facing): string {
  return `walk-${cls}-${FACING_NAMES[f]}`;
}

export function standFrame(cls: ClassId, f: Facing): number {
  return (CONTENT.classes[cls].spriteRow * 4 + f) * 3;
}

export function monsterAnimKey(row: number): string {
  return `monster-${row}`;
}

export function npcAnimKey(row: number): string {
  return `npc-${row}`;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image(TEX_TILES, tilesetUrl);
    this.load.spritesheet(TEX_CLASSES, classesUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet(TEX_MONSTERS, monstersUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet(TEX_NPCS, npcsUrl, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet(TEX_ICONS, iconsUrl, { frameWidth: 32, frameHeight: 32 });
    for (const [id, data] of Object.entries(TILED_MAPS)) this.load.tilemapTiledJSON(id, data);
  }

  create(): void {
    // Two animation frames per tile step, so the stride matches the walking speed.
    const frameRate = 2000 / (GAME_CONFIG.stepTicks * TICK_MS);
    for (const cls of CLASS_IDS) {
      for (const f of [Facing.Down, Facing.Left, Facing.Right, Facing.Up]) {
        const base = standFrame(cls, f);
        this.anims.create({
          key: walkAnimKey(cls, f),
          frames: this.anims.generateFrameNumbers(TEX_CLASSES, { frames: [base + 1, base, base + 2, base] }),
          frameRate,
          repeat: -1,
        });
      }
    }
    for (const m of Object.values(CONTENT.monsters)) {
      if (this.anims.exists(monsterAnimKey(m.spriteRow))) continue;
      this.anims.create({
        key: monsterAnimKey(m.spriteRow),
        frames: this.anims.generateFrameNumbers(TEX_MONSTERS, { frames: [m.spriteRow * 2, m.spriteRow * 2 + 1] }),
        frameRate: 3,
        repeat: -1,
      });
    }
    for (const n of Object.values(CONTENT.npcs)) {
      if (this.anims.exists(npcAnimKey(n.spriteRow))) continue;
      this.anims.create({
        key: npcAnimKey(n.spriteRow),
        frames: this.anims.generateFrameNumbers(TEX_NPCS, { frames: [n.spriteRow * 2, n.spriteRow * 2 + 1] }),
        frameRate: 1.5,
        repeat: -1,
      });
    }
    this.scene.start('Title');
  }
}
