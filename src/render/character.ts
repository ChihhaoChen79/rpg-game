// Layered ("paper doll") characters in the LPC Universal spritesheet layout: every layer
// (body, clothes, hair, armor, weapon...) is its own 832x1344 sheet with identical frames, and
// all layers show the same frame index. See assets/ASSETS.md.
import Phaser from 'phaser';
import { CONTENT } from '../content';
import type { ClassId, EquipSlot, Facing, ItemStack } from '../logic/types';
import { EQUIP_SLOTS } from '../logic/types';

export type CharAnim = 'spellcast' | 'thrust' | 'walk' | 'slash' | 'shoot' | 'hurt';

/** First row and frame count of each LPC animation; each has 4 rows (up, left, down, right). */
export const LPC_ANIMS: Record<CharAnim, { row: number; frames: number }> = {
  spellcast: { row: 0, frames: 7 },
  thrust: { row: 4, frames: 8 },
  walk: { row: 8, frames: 9 },
  slash: { row: 12, frames: 6 },
  shoot: { row: 16, frames: 13 },
  hurt: { row: 20, frames: 6 }, // single row, facing down
};
export const LPC_COLUMNS = 13;
export const LPC_FRAME = 64;

/** Our Facing (Down, Left, Right, Up) -> LPC row offset (up 0, left 1, down 2, right 3). */
const LPC_DIR: Record<Facing, number> = { 0: 2, 1: 1, 2: 3, 3: 0 };

/** Draw order by layer type (the part of the name before the first "_"). */
const ORDER_FRONT = ['cloak', 'body', 'pants', 'shoes', 'boots', 'shirt', 'armor', 'robe', 'gloves', 'hair', 'helmet', 'hat', 'shield', 'sword', 'staff', 'bow'];
const ORDER_BACK = ['shield', 'sword', 'staff', 'body', 'pants', 'shoes', 'boots', 'shirt', 'armor', 'robe', 'gloves', 'hair', 'helmet', 'hat', 'cloak', 'bow'];

export function layerTexture(name: string): string {
  return `char-${name}`;
}

function layerOrder(name: string, facingUp: boolean): number {
  const type = name.split('_')[0] ?? name;
  const i = (facingUp ? ORDER_BACK : ORDER_FRONT).indexOf(type);
  return i < 0 ? 50 : i;
}

/** Layer names for a character: base appearance plus the sprite of each equipped item. */
export function characterLayers(appearance: string[], equipment: Partial<Record<EquipSlot, ItemStack>>): string[] {
  const out = [...appearance];
  for (const slot of EQUIP_SLOTS) {
    const st = equipment[slot];
    const sprite = st ? CONTENT.items[st.itemId]?.sprite : undefined;
    if (sprite) out.push(sprite);
  }
  return out;
}

/** What a freshly created character of this class wears. */
export function startingLayers(cls: ClassId): string[] {
  const def = CONTENT.classes[cls];
  const eq: Partial<Record<EquipSlot, ItemStack>> = {};
  for (const si of def.startItems) {
    const d = CONTENT.items[si.itemId];
    if (si.equip && d?.slot) eq[d.slot] = { uid: 0, itemId: si.itemId, count: 1, enh: 0, dur: 0 };
  }
  return characterLayers(def.appearance, eq);
}

/** Walk cycle: 8 frames cover two tiles (one left + one right step). */
const WALK_FRAME_MS = 75;

/**
 * A character made of stacked layer sprites. Call update(now) every frame; it picks the frame
 * from the current state: dead > one-shot action (attack/cast) > walking > standing.
 */
export class CharacterView extends Phaser.GameObjects.Container {
  private names: string[] = [];
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private facing: Facing = 0;
  private walking = false;
  private action: { anim: CharAnim; start: number; duration: number } | null = null;
  private deadSince: number | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, layers: string[]) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setLayers(layers);
  }

  setLayers(names: string[]): void {
    if (names.join('|') === this.names.join('|')) return;
    this.names = [...names];
    for (const sp of this.sprites) sp.destroy();
    this.sprites = names
      .filter((n) => this.scene.textures.exists(layerTexture(n)))
      .map((n) => {
        const sp = this.scene.add.sprite(0, 0, layerTexture(n), 0).setOrigin(0.5, 62 / 64);
        sp.setData('layer', n);
        return sp;
      });
    this.add(this.sprites);
    this.sortLayers();
  }

  setFacing(f: Facing): void {
    if (f === this.facing) return;
    const wasUp = this.facing === 3;
    this.facing = f;
    if (wasUp !== (f === 3)) this.sortLayers();
  }

  setWalking(on: boolean): void {
    this.walking = on;
  }

  /** One-shot animation (attack, spell) lasting `duration` ms. */
  play(anim: CharAnim, duration: number): void {
    this.action = { anim, start: this.scene.time.now, duration };
  }

  setDead(dead: boolean): void {
    if (dead && this.deadSince === null) this.deadSince = this.scene.time.now;
    if (!dead) this.deadSince = null;
  }

  setTint(color: number | null): void {
    for (const sp of this.sprites) {
      if (color === null) sp.clearTint();
      else sp.setTintFill(color);
    }
  }

  update(now: number): void {
    let anim: CharAnim = 'walk';
    let frame = 0;
    let dirRow = LPC_DIR[this.facing];
    if (this.deadSince !== null) {
      anim = 'hurt';
      dirRow = 0;
      frame = Math.min(LPC_ANIMS.hurt.frames - 1, Math.floor((now - this.deadSince) / 90));
    } else if (this.action && now < this.action.start + this.action.duration) {
      anim = this.action.anim;
      const n = LPC_ANIMS[anim].frames;
      frame = Math.min(n - 1, Math.floor(((now - this.action.start) / this.action.duration) * n));
    } else {
      this.action = null;
      if (this.walking) frame = 1 + (Math.floor(now / WALK_FRAME_MS) % 8);
    }
    const index = (LPC_ANIMS[anim].row + dirRow) * LPC_COLUMNS + frame;
    for (const sp of this.sprites) sp.setFrame(index);
  }

  private sortLayers(): void {
    const up = this.facing === 3;
    const sorted = [...this.sprites].sort((a, b) => layerOrder(a.getData('layer') as string, up) - layerOrder(b.getData('layer') as string, up));
    sorted.forEach((sp, i) => this.moveTo(sp, i));
  }
}
