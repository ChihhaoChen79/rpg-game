// HUD overlay. Milestone 1: map name, safe-zone indicator, coordinates, side panels.
// Positions are in logical px (the map view is 1024x576); the camera zoom matches the map's.
import Phaser from 'phaser';
import { currentMap, playerInSafeZone } from '../logic/game';
import type { GameState } from '../logic/types';
import { REG_LAYOUT, REG_STATE } from '../render/WorldScene';
import { computeLayout, type Layout } from '../render/view';
import { t, UI_FONT } from './strings';

export class HudScene extends Phaser.Scene {
  private mapName!: Phaser.GameObjects.Text;
  private zone!: Phaser.GameObjects.Text;
  private coords!: Phaser.GameObjects.Text;
  private panels!: Phaser.GameObjects.Graphics;
  private zoom = 1;

  constructor() {
    super('Hud');
  }

  create(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: UI_FONT, fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    };
    this.panels = this.add.graphics();
    this.mapName = this.add.text(0, 0, '', style);
    this.zone = this.add.text(0, 0, '', style);
    this.coords = this.add.text(0, 0, '', { ...style, fontSize: '12px' });
    this.cameras.main.setOrigin(0, 0);

    this.applyLayout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    });
  }

  update(): void {
    const s = this.registry.get(REG_STATE) as GameState | undefined;
    if (!s) return;
    const mv = s.player.mover;
    this.mapName.setText(t(currentMap(s).nameKey));
    const safe = playerInSafeZone(s);
    this.zone.setText(t(safe ? 'hud.safeZone' : 'hud.danger')).setColor(safe ? '#8fd0ff' : '#ff9f80');
    this.coords.setText(t('hud.position', { x: mv.x, y: mv.y }));
  }

  private applyLayout(): void {
    const layout: Layout = (this.registry.get(REG_LAYOUT) as Layout | undefined)
      ?? computeLayout(this.scale.width, this.scale.height);
    this.zoom = layout.zoom;
    this.cameras.main.setViewport(0, 0, layout.canvasW, layout.canvasH).setZoom(layout.zoom);

    // Top-left of the map view (side panels hold HP/MP and the hotbar in later milestones).
    const left = layout.sidePanelW + 8;
    const top = layout.mapY / layout.zoom + 8;
    this.mapName.setPosition(left, top);
    this.zone.setPosition(left, top + 22);
    this.coords.setPosition(left, top + 44);
    for (const txt of [this.mapName, this.zone, this.coords]) txt.setResolution(this.zoom);

    this.panels.clear();
    if (layout.sidePanelW > 0) {
      this.panels.fillStyle(0x15151f, 1);
      this.panels.fillRect(0, 0, layout.sidePanelW, layout.uiH);
      this.panels.fillRect(layout.uiW - layout.sidePanelW, 0, layout.sidePanelW, layout.uiH);
    }
  }
}
