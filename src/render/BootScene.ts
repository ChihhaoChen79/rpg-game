import Phaser from 'phaser';
import tilesetUrl from '../../assets/tilesets/placeholder.png';
import playerUrl from '../../assets/sprites/player.png';
import { GAME_CONFIG, TILED_MAPS } from '../content';
import { TICK_MS } from '../logic/game';
import { Facing } from '../logic/types';

export const TEX_TILES = 'tiles';
export const TEX_PLAYER = 'player';
/** Name of the tileset inside the Tiled maps. */
export const TILESET_NAME = 'placeholder';

const FACING_NAMES = ['down', 'left', 'right', 'up'] as const;

export function walkAnimKey(f: Facing): string {
  return `player-walk-${FACING_NAMES[f]}`;
}

export function standFrame(f: Facing): number {
  return f * 3;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image(TEX_TILES, tilesetUrl);
    this.load.spritesheet(TEX_PLAYER, playerUrl, { frameWidth: 64, frameHeight: 64 });
    for (const [id, data] of Object.entries(TILED_MAPS)) this.load.tilemapTiledJSON(id, data);
  }

  create(): void {
    // Two animation frames per tile step, so the stride matches the walking speed.
    const frameRate = 2000 / (GAME_CONFIG.stepTicks * TICK_MS);
    for (const f of [Facing.Down, Facing.Left, Facing.Right, Facing.Up]) {
      const base = standFrame(f);
      this.anims.create({
        key: walkAnimKey(f),
        frames: this.anims.generateFrameNumbers(TEX_PLAYER, { frames: [base + 1, base, base + 2, base] }),
        frameRate,
        repeat: -1,
      });
    }
    this.scene.start('World');
    this.scene.launch('Hud');
  }
}
