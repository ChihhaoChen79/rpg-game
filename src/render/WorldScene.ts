// Owns the game state, runs the fixed 10 Hz logic tick, and draws the map and entities.
import Phaser from 'phaser';
import { CONTENT, GAME_CONFIG, TILED_MAPS } from '../content';
import { createPointerInput, type PointerInput } from '../input/pointer';
import type { Command } from '../logic/commands';
import { createGame, currentMap, tick, TICK_MS } from '../logic/game';
import { SAVE_VERSION, savedBossTimers, savedPlayer, type SaveData } from '../logic/save';
import type { ClassId, GameEvent, GameState, Monster, Mover, Stats, Vec } from '../logic/types';
import { writeSave } from '../save/storage';
import { iconTexture, pointerConsumed } from '../ui/widgets';
import { UI_FONT, t } from '../ui/strings';
import {
  monsterAnim, monsterTexture, TEX_TILES, TILESET_MARGIN, TILESET_NAME, TILESET_SPACING,
} from './BootScene';
import { CharacterView, characterLayers, type CharAnim } from './character';
import { computeLayout, TILE_SIZE, type Layout } from './view';

/** Registry keys shared with the HUD scene. */
export const REG_STATE = 'state';
export const REG_LAYOUT = 'layout';
export const REG_ISSUE = 'issue'; // (cmd: Command) => void
export const REG_SAVE = 'saveGame'; // () => Promise<boolean>
export const REG_TARGETING = 'targetingSlot'; // hotbar slot waiting for a target tap, or -1
export const REG_PICK_MONSTER = 'pickMonster'; // (screenX, screenY) => monster id under the pointer, or null
export const EVT_GAME = 'gameEvents'; // game.events: GameEvent[] after every tick

export interface WorldInit {
  save?: SaveData;
  newCharacter?: { classId: ClassId; stats: Stats; startMap: string };
}

const MAX_FRAME_MS = 250; // avoid a burst of ticks after the tab was in the background
const TOUCH_SLOP = 12; // extra hit-area px for fingers (plan §5 touch snapping)

/** Player action animation lengths, and when the hit lands within them (ms). */
const ACTION_MS: Record<CharAnim, number> = { slash: 360, thrust: 420, shoot: 700, spellcast: 520, walk: 0, hurt: 0 };
const IMPACT_MS: Record<CharAnim, number> = { slash: 180, thrust: 230, shoot: 520, spellcast: 300, walk: 0, hurt: 0 };
const PROJECTILE_MS = 140;
const MONSTER_IMPACT_MS = 170;

interface MonsterView {
  sprite: Phaser.GameObjects.Sprite;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  wasDead: boolean;
}

export class WorldScene extends Phaser.Scene {
  private state!: GameState;
  private acc = 0;
  private pending: Command[] = [];
  private pointer!: PointerInput;
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private player!: CharacterView;
  private marker!: Phaser.GameObjects.Rectangle;
  private targetRing!: Phaser.GameObjects.Ellipse;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private markerUntil = 0; // keep the tap marker up at least this long (ms, scene time)
  private monsterViews = new Map<number, MonsterView>();
  private groundViews = new Map<number, Phaser.GameObjects.Image>();
  private npcViews: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('World');
  }

  create(data: WorldInit): void {
    this.state = createGame({
      config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS,
      seed: Math.floor(Math.random() * 0x7fffffff), save: data.save, newCharacter: data.newCharacter,
    });
    this.acc = 0;
    this.pending = [];
    this.monsterViews.clear();
    this.groundViews.clear();
    this.registry.set(REG_STATE, this.state);
    this.registry.set(REG_TARGETING, -1);
    this.registry.set(REG_ISSUE, (cmd: Command) => this.pending.push(cmd));
    this.registry.set(REG_SAVE, () => this.saveGame());
    this.registry.set(REG_PICK_MONSTER, (sx: number, sy: number) => {
      const wp = this.screenToWorld(sx, sy);
      return wp ? (this.monsterUnder(wp.x, wp.y, 0)?.id ?? null) : null;
    });

    this.player = new CharacterView(this, 0, 0, this.playerLayers());
    this.marker = this.add.rectangle(0, 0, TILE_SIZE - 4, TILE_SIZE - 4)
      .setStrokeStyle(2, 0xffe060).setDepth(2).setVisible(false);
    this.targetRing = this.add.ellipse(0, 0, 40, 16).setStrokeStyle(2, 0xff5050).setDepth(2).setVisible(false);
    this.debugGfx = this.add.graphics().setDepth(100000).setVisible(false);

    this.buildMap();
    this.applyLayout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    });

    this.pointer = createPointerInput(this, {
      toTile: (sx, sy) => this.screenToTile(sx, sy),
      issue: (cmd) => this.pending.push(cmd),
      onTap: (tile) => this.showMarker(tile),
      pick: (sx, sy, touch) => this.pickTarget(sx, sy, touch),
      consumed: (p) => pointerConsumed(this, p),
    });

    if (import.meta.env.DEV) {
      this.input.keyboard?.on('keydown-G', () => this.debugGfx.setVisible(!this.debugGfx.visible));
    }

    this.scene.launch('Hud');
    // A new character is saved right away, so the single slot now holds it (plan §7.20).
    if (data.newCharacter) void this.saveGame(true);
    this.time.delayedCall(300, () => this.game.events.emit(EVT_GAME, [{ type: 'log', key: 'log.welcome' }]));
  }

  update(_time: number, delta: number): void {
    this.acc += Math.min(delta, MAX_FRAME_MS);
    while (this.acc >= TICK_MS) {
      this.pointer.sample();
      tick(this.state, this.pending);
      this.pending = [];
      this.handleEvents(this.state.events);
      this.acc -= TICK_MS;
    }
    this.draw(this.acc / TICK_MS);
  }

  // ---------------------------------------------------------------- events & saving

  private handleEvents(events: GameEvent[]): void {
    if (events.length === 0) return;
    let hitDelay = 0; // damage numbers wait for the swing / arrow / spell that caused them
    for (const e of events) {
      switch (e.type) {
        case 'mapChanged':
          this.buildMap();
          break;
        case 'damage': {
          const show = () => {
            this.floatText(e.to, e.miss ? 'MISS' : String(e.amount), e.miss ? '#c0c0c0' : e.to === 'player' ? '#ff6060' : '#ffffff');
            if (!e.miss) this.flash(e.to);
          };
          if (hitDelay > 0) this.time.delayedCall(hitDelay, show);
          else show();
          break;
        }
        case 'heal':
          if (e.hp > 0) this.floatText('player', `+${e.hp}`, '#70ff70');
          if (e.mp > 0) this.floatText('player', `+${e.mp}`, '#70b0ff');
          break;
        case 'attack':
          hitDelay = this.attackEffect(e.from, e.to, e.style, e.spellId);
          break;
        case 'monsterDied':
          this.monsterDies(e.id);
          break;
        case 'levelUp':
          this.floatText('player', 'LEVEL UP!', '#ffe060', 24);
          break;
        case 'saveRequested':
          void this.saveGame();
          break;
        default:
          break;
      }
    }
    this.game.events.emit(EVT_GAME, events);
  }

  /** Writes the save slot. Returns success; failures are reported in the message log. */
  private async saveGame(silent = false): Promise<boolean> {
    const s = this.state;
    if (s.player.dead) return false;
    const data: SaveData = {
      version: SAVE_VERSION, savedAt: Date.now(), mapId: s.mapId, x: s.player.mover.x, y: s.player.mover.y,
      nextId: s.nextId, player: savedPlayer(s.player), bossTimers: savedBossTimers(s.bossTimers, s.tick),
    };
    try {
      await writeSave(data);
      if (!silent) this.game.events.emit(EVT_GAME, [{ type: 'log', key: 'log.saved', tone: 'good' }]);
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.game.events.emit(EVT_GAME, [{ type: 'log', key: 'log.saveFailed', params: { reason }, tone: 'bad' }]);
      return false;
    }
  }

  // ---------------------------------------------------------------- layout & map

  private applyLayout(): void {
    const layout: Layout = computeLayout(this.scale.width, this.scale.height);
    this.registry.set(REG_LAYOUT, layout);
    const cam = this.cameras.main;
    cam.setViewport(layout.mapX, layout.mapY, layout.mapW, layout.mapH);
    cam.setZoom(layout.zoom);
  }

  private buildMap(): void {
    this.tilemap?.destroy();
    for (const v of this.monsterViews.values()) this.destroyMonsterView(v);
    this.monsterViews.clear();
    for (const g of this.groundViews.values()) g.destroy();
    this.groundViews.clear();
    for (const o of this.npcViews) o.destroy();
    this.npcViews = [];

    const map = this.make.tilemap({ key: this.state.mapId });
    const tiles = map.addTilesetImage(TILESET_NAME, TEX_TILES, TILE_SIZE, TILE_SIZE, TILESET_MARGIN, TILESET_SPACING);
    if (!tiles) throw new Error(`Tileset "${TILESET_NAME}" missing in map ${this.state.mapId}`);
    map.createLayer('ground', tiles)?.setDepth(-2);
    map.createLayer('deco', tiles)?.setDepth(-1);
    this.tilemap = map;
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.marker.setVisible(false);

    for (const n of currentMap(this.state).npcs) {
      const def = CONTENT.npcs[n.npcId];
      if (!def) continue;
      const x = (n.x + 0.5) * TILE_SIZE;
      const y = n.y * TILE_SIZE + 28;
      const view = new CharacterView(this, x, y, def.appearance).setDepth(y);
      view.update(0);
      const name = this.add.text(x, y - 58, t(def.nameKey), {
        fontFamily: UI_FONT, fontSize: '12px', color: '#ffe9a8', stroke: '#000', strokeThickness: 3,
        resolution: this.cameras.main.zoom,
      }).setOrigin(0.5).setDepth(y + 1);
      this.npcViews.push(view, name);
    }
    this.drawDebug();
    this.draw(0);
  }

  /** Tile grid, blocked tiles (red), safe zone (blue), exits (green), spawn areas (yellow). Dev only, key G. */
  private drawDebug(): void {
    const m = currentMap(this.state);
    const g = this.debugGfx;
    const T = TILE_SIZE;
    g.clear();
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const i = y * m.width + x;
        if (m.blocked[i]) g.fillStyle(0xff3030, 0.35).fillRect(x * T, y * T, T, T);
        else if (m.safe[i]) g.fillStyle(0x3080ff, 0.2).fillRect(x * T, y * T, T, T);
      }
    }
    for (const e of m.exits) g.lineStyle(2, 0x40ff80, 0.9).strokeRect(e.x * T, e.y * T, e.w * T, e.h * T);
    for (const a of m.spawns) g.lineStyle(2, 0xffe040, 0.8).strokeRect(a.x * T, a.y * T, a.w * T, a.h * T);
    g.lineStyle(1, 0x000000, 0.25);
    for (let x = 0; x <= m.width; x++) g.lineBetween(x * T, 0, x * T, m.height * T);
    for (let y = 0; y <= m.height; y++) g.lineBetween(0, y * T, m.width * T, y * T);
  }

  // ---------------------------------------------------------------- drawing

  /** alpha: fraction (0..1) of the way to the next logic tick, for smooth interpolation. */
  private draw(alpha: number): void {
    const s = this.state;
    const p = s.player;
    const mv = p.mover;
    const pp = interpolatedPos(mv, alpha, s.config.stepTicks);
    const px = (pp.x + 0.5) * TILE_SIZE;
    const py = pp.y * TILE_SIZE + 28;
    this.player.setPosition(px, py).setDepth(py);
    const walking = mv.moving || mv.path.length > 0;
    this.player.setLayers(this.playerLayers()); // no-op unless equipment changed
    this.player.setFacing(mv.facing);
    this.player.setWalking(walking);
    this.player.setDead(p.dead);
    // Blink while invulnerable after respawning.
    this.player.setAlpha(!p.dead && s.tick < p.invulnUntil && Math.floor(this.time.now / 120) % 2 === 0 ? 0.35 : 1);
    this.player.update(this.time.now);
    this.cameras.main.centerOn(px, py - TILE_SIZE / 2);
    if (this.marker.visible && !walking && this.time.now > this.markerUntil) this.marker.setVisible(false);

    this.drawMonsters(alpha);
    this.drawGround();

    const target = p.action.kind === 'attack' ? s.monsters.find((m) => m.id === (p.action as { monsterId: number }).monsterId && !m.dead) : undefined;
    if (target) {
      const tp = interpolatedPos(target.mover, alpha, CONTENT.monsters[target.defId]!.stepTicks);
      this.targetRing.setPosition((tp.x + 0.5) * TILE_SIZE, tp.y * TILE_SIZE + 28).setVisible(true);
    } else this.targetRing.setVisible(false);
  }

  private drawMonsters(alpha: number): void {
    const seen = new Set<number>();
    for (const m of this.state.monsters) {
      seen.add(m.id);
      let v = this.monsterViews.get(m.id);
      const def = CONTENT.monsters[m.defId]!;
      if (!v) {
        const size = def.frame ?? 64;
        const sprite = this.add.sprite(0, 0, monsterTexture(def.sprite), 0).setOrigin(0.5, (size - 2) / size);
        sprite.play({ key: monsterAnim(def.sprite, 'move'), startFrame: m.id % 4 });
        const hpBg = this.add.rectangle(0, 0, 30, 4, 0x000000).setOrigin(0.5);
        const hpFill = this.add.rectangle(0, 0, 28, 2, 0xe04040).setOrigin(0, 0.5);
        v = { sprite, hpBg, hpFill, wasDead: m.dead };
        this.monsterViews.set(m.id, v);
      }
      if (m.dead) {
        if (!v.wasDead) {
          v.wasDead = true;
          v.hpBg.setVisible(false);
          v.hpFill.setVisible(false);
        }
        continue;
      }
      if (v.wasDead) {
        v.wasDead = false;
        this.tweens.killTweensOf(v.sprite);
        v.sprite.setAlpha(1).play(monsterAnim(def.sprite, 'move'));
      }
      // Idle monsters keep breathing slowly; moving ones animate at full speed.
      if (v.sprite.anims.currentAnim?.key === monsterAnim(def.sprite, 'move')) {
        v.sprite.anims.timeScale = m.mover.moving ? 1 : 0.4;
      }
      const p = interpolatedPos(m.mover, alpha, def.stepTicks);
      const x = (p.x + 0.5) * TILE_SIZE;
      const y = p.y * TILE_SIZE + 28;
      v.sprite.setPosition(x, y).setDepth(y).setVisible(true);
      if (m.mover.facing === 1) v.sprite.setFlipX(true);
      else if (m.mover.facing === 2) v.sprite.setFlipX(false);
      const showHp = m.hp < def.hp;
      const barY = y - Math.round((def.frame ?? 64) * 0.7);
      v.hpBg.setVisible(showHp && !def.boss).setPosition(x, barY).setDepth(y + 1);
      v.hpFill.setVisible(showHp && !def.boss).setPosition(x - 14, barY).setDepth(y + 2);
      v.hpFill.width = 28 * Math.max(0, m.hp / def.hp);
    }
    for (const [id, v] of this.monsterViews) {
      if (!seen.has(id)) {
        this.destroyMonsterView(v);
        this.monsterViews.delete(id);
      }
    }
  }

  private destroyMonsterView(v: MonsterView): void {
    v.sprite.destroy();
    v.hpBg.destroy();
    v.hpFill.destroy();
  }

  private drawGround(): void {
    const s = this.state;
    const seen = new Set<number>();
    for (const g of s.groundItems) {
      if (g.mapId !== s.mapId) continue;
      seen.add(g.id);
      if (this.groundViews.has(g.id)) continue;
      const icon = CONTENT.items[g.item.itemId]?.icon ?? 'gold';
      const img = this.add.image((g.x + 0.5) * TILE_SIZE, (g.y + 0.5) * TILE_SIZE + 4, iconTexture(icon))
        .setDisplaySize(24, 24).setDepth(g.y * TILE_SIZE);
      this.groundViews.set(g.id, img);
    }
    for (const [id, img] of this.groundViews) {
      if (!seen.has(id)) {
        img.destroy();
        this.groundViews.delete(id);
      }
    }
  }

  private playerLayers(): string[] {
    const p = this.state.player;
    return characterLayers(CONTENT.classes[p.classId].appearance, p.equipment);
  }

  private spriteFor(who: 'player' | number): { x: number; y: number } | undefined {
    return who === 'player' ? this.player : this.monsterViews.get(who)?.sprite;
  }

  private monsterDies(id: number): void {
    const v = this.monsterViews.get(id);
    const m = this.state.monsters.find((x) => x.id === id);
    if (!v || !m) return;
    v.wasDead = true;
    v.hpBg.setVisible(false);
    v.hpFill.setVisible(false);
    v.sprite.play(monsterAnim(CONTENT.monsters[m.defId]!.sprite, 'die'));
    this.tweens.add({ targets: v.sprite, alpha: 0, delay: 500, duration: 300 });
  }

  private floatText(who: 'player' | number, text: string, color: string, size = 16): void {
    const sp = this.spriteFor(who);
    if (!sp) return;
    const tx = this.add.text(sp.x + Phaser.Math.Between(-6, 6), sp.y - 52, text, {
      fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 4,
      resolution: this.cameras.main.zoom,
    }).setOrigin(0.5).setDepth(1e6);
    this.tweens.add({ targets: tx, y: tx.y - 26, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => tx.destroy() });
  }

  private flash(who: 'player' | number): void {
    if (who === 'player') {
      this.player.setTint(0xffffff);
      this.time.delayedCall(80, () => this.player.setTint(null));
      return;
    }
    const sp = this.monsterViews.get(who)?.sprite;
    if (!sp) return;
    sp.setTintFill(0xffffff);
    this.time.delayedCall(80, () => sp.clearTint());
  }

  /**
   * Plays the attacker's animation and any projectile. Returns how long (ms) until the hit lands,
   * so damage numbers can wait for it.
   */
  private attackEffect(from: 'player' | number, to: 'player' | number, style: 'melee' | 'arrow' | 'spell', spellId?: string): number {
    if (from !== 'player') {
      const v = this.monsterViews.get(from);
      const m = this.state.monsters.find((x) => x.id === from);
      if (v && m) {
        const sprite = CONTENT.monsters[m.defId]!.sprite;
        v.sprite.play(monsterAnim(sprite, 'attack'));
        v.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          if (!m.dead) v.sprite.play(monsterAnim(sprite, 'move'));
        });
      }
      return MONSTER_IMPACT_MS;
    }

    let anim: CharAnim = 'spellcast';
    if (style === 'arrow') anim = 'shoot';
    else if (style === 'melee') {
      const w = this.state.player.equipment.weapon;
      const wd = w ? CONTENT.items[w.itemId]?.weapon : undefined;
      anim = wd && wd.anim !== 'shoot' ? wd.anim : 'slash'; // fists and bow-as-club swing
    }
    this.player.play(anim, ACTION_MS[anim]);
    const impact = IMPACT_MS[anim];
    if (style === 'melee') return impact;

    const a = this.player;
    if (style === 'spell' && (spellId === 'heal' || spellId === 'spirit_power')) {
      this.time.delayedCall(impact, () => {
        const ring = this.add.ellipse(a.x, a.y - 20, 20, 20, spellId === 'heal' ? 0x80ff90 : 0xfff080, 0.5).setDepth(1e6);
        this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
      });
      return impact;
    }
    const b = this.spriteFor(to);
    if (!b) return impact;
    this.time.delayedCall(impact, () => {
      const proj = style === 'arrow'
        ? this.add.rectangle(a.x, a.y - 24, 14, 2, 0xe8e0c8).setRotation(Math.atan2(b.y - a.y, b.x - a.x))
        : this.add.ellipse(a.x, a.y - 24, 12, 12, 0xff8030);
      proj.setDepth(1e6);
      this.tweens.add({ targets: proj, x: b.x, y: b.y - 24, duration: PROJECTILE_MS, onComplete: () => proj.destroy() });
    });
    return impact + PROJECTILE_MS;
  }

  // ---------------------------------------------------------------- input

  private screenToWorld(sx: number, sy: number): Phaser.Math.Vector2 | null {
    const cam = this.cameras.main;
    if (sx < cam.x || sy < cam.y || sx >= cam.x + cam.width || sy >= cam.y + cam.height) return null;
    return cam.getWorldPoint(sx, sy);
  }

  private screenToTile(sx: number, sy: number): Vec | null {
    const wp = this.screenToWorld(sx, sy);
    return wp ? { x: Math.floor(wp.x / TILE_SIZE), y: Math.floor(wp.y / TILE_SIZE) } : null;
  }

  /**
   * What a click/tap at a screen point means, by priority: monster > ground item > NPC > ground
   * (plan §5). Hit areas are larger than sprites and grow for touch input.
   */
  private pickTarget(sx: number, sy: number, touch: boolean): Command | 'ground' | null {
    const s = this.state;
    if (s.player.dead) return null;
    const wp = this.screenToWorld(sx, sy);
    if (!wp) return null;
    const slop = touch ? TOUCH_SLOP : 0;
    const zoomSlop = slop / this.cameras.main.zoom * 2;

    // Hotbar spell waiting for a target?
    const slot = this.registry.get(REG_TARGETING) as number;
    const monster = this.monsterUnder(wp.x, wp.y, zoomSlop);
    if (slot >= 0) {
      this.registry.set(REG_TARGETING, -1);
      if (monster) return { type: 'useHotbar', slot, targetId: monster.id };
      return null;
    }
    if (monster) return { type: 'attack', monsterId: monster.id };

    const tx = Math.floor(wp.x / TILE_SIZE);
    const ty = Math.floor(wp.y / TILE_SIZE);
    let ground = null;
    for (const g of s.groundItems) {
      if (g.mapId === s.mapId && Math.abs(g.x - tx) <= (touch ? 1 : 0) && Math.abs(g.y - ty) <= (touch ? 1 : 0)) {
        if (!ground || (g.x === tx && g.y === ty)) ground = g;
      }
    }
    if (ground) {
      this.showMarker(ground);
      return { type: 'pickup', groundId: ground.id };
    }

    for (const n of currentMap(s).npcs) {
      const cx = (n.x + 0.5) * TILE_SIZE;
      const cy = n.y * TILE_SIZE;
      if (Math.abs(wp.x - cx) <= 18 + zoomSlop && wp.y >= cy - 30 - zoomSlop && wp.y <= cy + 32 + zoomSlop) {
        this.showMarker(n);
        return { type: 'talk', npcId: n.npcId };
      }
    }
    return 'ground';
  }

  private monsterUnder(wx: number, wy: number, slop: number): Monster | undefined {
    let best: Monster | undefined;
    let bestD = Infinity;
    for (const m of this.state.monsters) {
      if (m.dead) continue;
      const v = this.monsterViews.get(m.id);
      const k = (CONTENT.monsters[m.defId]?.frame ?? 64) / 64; // bigger sprites, bigger hit area
      const cx = v ? v.sprite.x : (m.mover.x + 0.5) * TILE_SIZE;
      const cy = v ? v.sprite.y - 18 * k : m.mover.y * TILE_SIZE + 10;
      const dx = Math.abs(wx - cx);
      const dy = Math.abs(wy - cy);
      if (dx <= 22 * k + slop && dy <= 26 * k + slop) {
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          best = m;
          bestD = d;
        }
      }
    }
    return best;
  }

  /** Yellow box on the tapped tile, so the player sees what the click/tap hit. */
  private showMarker(tile: Vec): void {
    this.marker.setPosition((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE).setVisible(true);
    this.markerUntil = this.time.now + 500;
  }
}

export function interpolatedPos(mv: Mover, alpha: number, stepTicks: number): Vec {
  if (!mv.moving) return { x: mv.x, y: mv.y };
  const t = Math.min(1, (mv.stepElapsed + alpha) / stepTicks);
  return { x: mv.fromX + (mv.x - mv.fromX) * t, y: mv.fromY + (mv.y - mv.fromY) * t };
}
