// Owns the game state, runs the fixed 10 Hz logic tick, and draws the map and entities.
import Phaser from 'phaser';
import { GAME_CONFIG, START_MAP, TILED_MAPS } from '../content';
import { createPointerInput, type PointerInput } from '../input/pointer';
import type { Command } from '../logic/commands';
import { createGame, currentMap, tick, TICK_MS } from '../logic/game';
import type { GameState, Mover, Vec } from '../logic/types';
import { standFrame, TEX_PLAYER, TEX_TILES, TILESET_NAME, walkAnimKey } from './BootScene';
import { computeLayout, TILE_SIZE, type Layout } from './view';

/** Registry key under which the live GameState is shared with other scenes. */
export const REG_STATE = 'state';
export const REG_LAYOUT = 'layout';
export const REG_DEBUG = 'debugOverlay';

const MAX_FRAME_MS = 250; // avoid a burst of ticks after the tab was in the background

export class WorldScene extends Phaser.Scene {
  private state!: GameState;
  private acc = 0;
  private pending: Command[] = [];
  private pointer!: PointerInput;
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private player!: Phaser.GameObjects.Sprite;
  private marker!: Phaser.GameObjects.Rectangle;
  private debugGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('World');
  }

  create(): void {
    this.state = createGame({
      config: GAME_CONFIG,
      maps: TILED_MAPS,
      startMap: START_MAP,
      seed: Math.floor(Math.random() * 0x7fffffff),
    });
    this.registry.set(REG_STATE, this.state);

    this.player = this.add.sprite(0, 0, TEX_PLAYER, standFrame(this.state.player.mover.facing));
    this.player.setOrigin(0.5, 62 / 64).setDepth(10);
    this.marker = this.add.rectangle(0, 0, TILE_SIZE - 4, TILE_SIZE - 4)
      .setStrokeStyle(2, 0xffe060).setDepth(5).setVisible(false);
    this.debugGfx = this.add.graphics().setDepth(20).setVisible(false);

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
    });

    if (import.meta.env.DEV) {
      this.input.keyboard?.on('keydown-G', () => {
        const on = !this.debugGfx.visible;
        this.debugGfx.setVisible(on);
        this.registry.set(REG_DEBUG, on);
      });
    }
  }

  update(_time: number, delta: number): void {
    this.acc += Math.min(delta, MAX_FRAME_MS);
    while (this.acc >= TICK_MS) {
      this.pointer.sample();
      tick(this.state, this.pending);
      this.pending = [];
      for (const e of this.state.events) {
        if (e.type === 'mapChanged') this.buildMap();
      }
      this.acc -= TICK_MS;
    }
    this.drawPlayer(this.acc / TICK_MS);
  }

  private applyLayout(): void {
    const layout: Layout = computeLayout(this.scale.width, this.scale.height);
    this.registry.set(REG_LAYOUT, layout);
    const cam = this.cameras.main;
    cam.setViewport(layout.mapX, layout.mapY, layout.mapW, layout.mapH);
    cam.setZoom(layout.zoom);
  }

  private buildMap(): void {
    this.tilemap?.destroy();
    const map = this.make.tilemap({ key: this.state.mapId });
    const tiles = map.addTilesetImage(TILESET_NAME, TEX_TILES);
    if (!tiles) throw new Error(`Tileset "${TILESET_NAME}" missing in map ${this.state.mapId}`);
    map.createLayer('ground', tiles)?.setDepth(0);
    map.createLayer('deco', tiles)?.setDepth(1);
    this.tilemap = map;
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.marker.setVisible(false);
    this.drawDebug();
    this.drawPlayer(0);
  }

  /** Tile grid, blocked tiles (red) and safe zone (blue). Dev builds only, toggle with G. */
  private drawDebug(): void {
    const m = currentMap(this.state);
    const g = this.debugGfx;
    g.clear();
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const i = y * m.width + x;
        if (m.blocked[i]) g.fillStyle(0xff3030, 0.35).fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        else if (m.safe[i]) g.fillStyle(0x3080ff, 0.2).fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    for (const e of m.exits) {
      g.lineStyle(2, 0x40ff80, 0.9).strokeRect(e.x * TILE_SIZE, e.y * TILE_SIZE, e.w * TILE_SIZE, e.h * TILE_SIZE);
    }
    g.lineStyle(1, 0x000000, 0.25);
    for (let x = 0; x <= m.width; x++) g.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, m.height * TILE_SIZE);
    for (let y = 0; y <= m.height; y++) g.lineBetween(0, y * TILE_SIZE, m.width * TILE_SIZE, y * TILE_SIZE);
  }

  /** alpha: fraction (0..1) of the way to the next logic tick, for smooth interpolation. */
  private drawPlayer(alpha: number): void {
    const mv = this.state.player.mover;
    const p = interpolatedPos(mv, alpha, this.state.config.stepTicks);
    this.player.setPosition((p.x + 0.5) * TILE_SIZE, p.y * TILE_SIZE + 28);
    const walking = mv.moving || mv.path.length > 0;
    if (walking) this.player.anims.play(walkAnimKey(mv.facing), true);
    else {
      this.player.anims.stop();
      this.player.setFrame(standFrame(mv.facing));
    }
    this.cameras.main.centerOn(this.player.x, this.player.y - TILE_SIZE / 2);
    if (this.marker.visible && !walking) this.marker.setVisible(false);
  }

  private screenToTile(sx: number, sy: number): Vec | null {
    const cam = this.cameras.main;
    if (sx < cam.x || sy < cam.y || sx >= cam.x + cam.width || sy >= cam.y + cam.height) return null;
    const wp = cam.getWorldPoint(sx, sy);
    return { x: Math.floor(wp.x / TILE_SIZE), y: Math.floor(wp.y / TILE_SIZE) };
  }

  private showMarker(tile: Vec): void {
    this.marker.setPosition((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE).setVisible(true);
  }
}

export function interpolatedPos(mv: Mover, alpha: number, stepTicks: number): Vec {
  if (!mv.moving) return { x: mv.x, y: mv.y };
  const t = Math.min(1, (mv.stepElapsed + alpha) / stepTicks);
  return { x: mv.fromX + (mv.x - mv.fromX) * t, y: mv.fromY + (mv.y - mv.fromY) * t };
}
