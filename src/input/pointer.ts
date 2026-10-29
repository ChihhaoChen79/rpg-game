// Mouse and touch -> Commands (plan §5). Left button / tap only.
// A press on a monster, ground item or NPC targets it; on the ground it walks there, and
// holding keeps walking toward the pointer.
import type Phaser from 'phaser';
import type { Command } from '../logic/commands';
import type { Vec } from '../logic/types';

export interface PointerInputHooks {
  /** Screen (canvas) position -> map tile, or null if outside the map view. */
  toTile(screenX: number, screenY: number): Vec | null;
  /** What is under the pointer: a targeting command, 'ground' to walk, or null to ignore. */
  pick(screenX: number, screenY: number, touch: boolean): Command | 'ground' | null;
  /** True if the UI already handled this press. */
  consumed(p: Phaser.Input.Pointer): boolean;
  issue(cmd: Command): void;
  /** Visual feedback for a fresh walk order. */
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
    if (p.button !== 0 || hooks.consumed(p)) return; // right button unused
    const what = hooks.pick(p.x, p.y, p.wasTouch);
    if (what === null) return;
    if (what !== 'ground') {
      held = null;
      hooks.issue(what);
      return;
    }
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
