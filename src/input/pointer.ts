// Mouse and touch -> Commands (plan §5). Left button / tap only.
// Click or tap a tile to walk there; hold to keep walking toward the pointer.
import type Phaser from 'phaser';
import type { Command } from '../logic/commands';
import type { Vec } from '../logic/types';

export interface PointerInputHooks {
  /** Screen (canvas) position -> map tile, or null if outside the map view. */
  toTile(screenX: number, screenY: number): Vec | null;
  issue(cmd: Command): void;
  /** Visual feedback for a fresh click/tap. */
  onTap?(tile: Vec): void;
}

export interface PointerInput {
  /** Call once per logic tick, before the tick runs. */
  sample(): void;
}

export function createPointerInput(scene: Phaser.Scene, hooks: PointerInputHooks): PointerInput {
  let held: Phaser.Input.Pointer | null = null;
  let lastTile: Vec | null = null;

  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    if (p.button !== 0) return; // right button unused
    const tile = hooks.toTile(p.x, p.y);
    if (!tile) return;
    held = p;
    lastTile = tile;
    hooks.issue({ type: 'moveTo', x: tile.x, y: tile.y });
    hooks.onTap?.(tile);
  });
  const release = (p: Phaser.Input.Pointer) => {
    if (held === p) held = null;
  };
  scene.input.on('pointerup', release);
  scene.input.on('pointerupoutside', release);

  return {
    sample() {
      if (!held) return;
      if (!held.isDown) {
        held = null;
        return;
      }
      // The camera follows the player, so the tile under a still pointer keeps changing.
      const tile = hooks.toTile(held.x, held.y);
      if (!tile || (lastTile && tile.x === lastTile.x && tile.y === lastTile.y)) return;
      lastTile = tile;
      hooks.issue({ type: 'moveTo', x: tile.x, y: tile.y });
    },
  };
}
