// Title screen / lobby (plan §7.20): up to SAVE_SLOTS characters, credits.
import Phaser from 'phaser';
import credits from '../../data/credits.json';
import { playBgm } from '../audio/audio';
import { CONTENT, GAME_CONFIG, TILED_MAPS } from '../content';
import { createGame } from '../logic/game';
import type { SaveData } from '../logic/save';
import { derive, levelProgress } from '../logic/stats';
import { STAT_KEYS } from '../logic/types';
import { CharacterView, characterLayers } from '../render/character';
import { nameColor } from '../render/nameColor';
import { VIEW_H, VIEW_W } from '../render/view';
import { bootDone } from '../boot';
import { deleteSave, exportSaveFile, loadAllSaves, pickSaveFile, requestPersistentStorage, SAVE_SLOTS, writeSave } from '../save/storage';
import { confirmBox, messageBox, setupMenuCamera } from './menuLayout';
import { t } from './strings';
import { blockInput, button, COLORS, label } from './widgets';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  /**
   * Lobby: one card per save slot. A filled card shows the character in the gear it was saved
   * with; tapping it shows its status with 進入遊戲. An empty card creates or imports a character.
   */
  create(): void {
    setupMenuCamera(this);
    requestPersistentStorage();
    playBgm('town'); // starts after the first tap (browsers block sound until then)
    const cx = VIEW_W / 2;
    label(this, cx, 52, t('app.title'), { size: 44, bold: true, stroke: true, color: '#ffe9a8' }).setOrigin(0.5);
    label(this, cx, 96, t('title.pickSlot'), { size: 14, color: '#a8a8c0' }).setOrigin(0.5);
    button(this, 24, VIEW_H - 56, 160, 40, t('title.credits'), () => this.showCredits(), { size: 14 });
    label(this, VIEW_W - 8, VIEW_H - 8, `${t('title.version')} ${__APP_VERSION__}`, { size: 11, color: '#6a6a80' }).setOrigin(1);

    // Hide 載入中… once this screen has actually been drawn.
    this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => this.time.delayedCall(0, bootDone));
    void loadAllSaves().then((saves) => {
      if (!this.sys.isActive()) return;
      saves.forEach((save, i) => this.slotCard(i, save));
    });
  }

  private slotCard(slot: number, save: SaveData | null): void {
    const w = 300;
    const h = 300;
    const x = (VIEW_W - (SAVE_SLOTS * w + (SAVE_SLOTS - 1) * 24)) / 2 + slot * (w + 24);
    const y = 116;
    const frame = this.add.rectangle(x, y, w, h, COLORS.panel).setOrigin(0).setStrokeStyle(2, save ? COLORS.panelEdge : 0x3a3a50);
    frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => (save ? this.statusBox(slot, save) : this.emptyBox(slot)));
    frame.on('pointerover', () => frame.setStrokeStyle(3, COLORS.select)).on('pointerout', () => frame.setStrokeStyle(2, save ? COLORS.panelEdge : 0x3a3a50));
    label(this, x + 12, y + 10, t('title.slot', { n: slot + 1 }), { size: 12, color: '#8080a0' });
    if (!save) {
      label(this, x + w / 2, y + h / 2 - 14, t('title.emptySlot'), { size: 18, color: '#9090a8' }).setOrigin(0.5);
      label(this, x + w / 2, y + h / 2 + 16, t('title.emptyHint'), { size: 13, color: '#70708a' }).setOrigin(0.5);
      return;
    }
    const p = saveParams(save);
    label(this, x + w / 2, y + 34, String(p.name), { size: 20, bold: true, color: nameColor(save.player.alignment, CONTENT.balance.nameColorFullAt) }).setOrigin(0.5);
    label(this, x + w / 2, y + 62, t('title.classLevel', p), { size: 15 }).setOrigin(0.5);
    const view = new CharacterView(this, x + w / 2, y + 222, savedLayers(save)).setScale(2.5);
    view.update(0);
    label(this, x + w / 2, y + 246, t(String(p.map)), { size: 13, color: '#a8c8a8' }).setOrigin(0.5);
    label(this, x + w / 2, y + 270, t('title.savedAt', { time: savedTime(save) }), { size: 11, color: '#8080a0' }).setOrigin(0.5);
  }

  /** A modal box: a shade that swallows input, a panel, and its contents. */
  private modal(w: number, h: number): { c: Phaser.GameObjects.Container; x: number; y: number } {
    const shade = this.add.rectangle(-4000, -4000, 12000, 12000, 0x000000, 0.65).setOrigin(0);
    blockInput(this, shade);
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    const box = this.add.rectangle(x, y, w, h, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.panelEdge);
    return { c: this.add.container(0, 0, [shade, box]).setDepth(1000), x, y };
  }

  /** The saved character's status, with 進入遊戲 / 匯出 / 刪除. */
  private statusBox(slot: number, save: SaveData): void {
    const w = 640;
    const h = 400;
    const { c, x, y } = this.modal(w, h);
    const s = createGame({ config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed: 1, save });
    const pl = s.player;
    const d = derive(CONTENT, pl);
    const p = saveParams(save);
    const view = new CharacterView(this, x + 110, y + 230, savedLayers(save)).setScale(3);
    view.update(0);
    c.add(view);
    c.add(label(this, x + 220, y + 24, String(p.name), { size: 22, bold: true, color: nameColor(pl.alignment, CONTENT.balance.nameColorFullAt) }));
    c.add(label(this, x + 220, y + 58, t('title.classLevel', p), { size: 16 }));
    const al = pl.alignment >= 300 ? 'align.good' : pl.alignment <= -300 ? 'align.evil' : 'align.neutral';
    const rows = [
      `${t('hud.hp', { hp: pl.hp, max: d.maxHp })}\u3000${t('hud.mp', { mp: pl.mp, max: d.maxMp })}`,
      t('hud.exp', { pct: (levelProgress(CONTENT, pl) * 100).toFixed(1) }),
      STAT_KEYS.map((k) => `${t(`stat.${k}`)} ${pl.stats[k]}`).join('\u3000'),
      `${t('char.def')} ${d.def}\u3000${t('char.mr')} ${d.mr}%`,
      t('hud.alignment', { n: pl.alignment, label: al }),
      t('hud.gold', { n: pl.gold }),
      `${t(String(p.map))}\u3000${t('title.savedAt', { time: savedTime(save) })}`,
    ];
    c.add(label(this, x + 220, y + 96, rows.join('\n'), { size: 15, color: '#d8d8e8' }).setLineSpacing(8));
    const close = () => c.destroy();
    c.add(button(this, x + 220, y + h - 64, 180, 46, t('title.enter'), () => {
      close();
      this.scene.start('World', { slot, save });
    }, { size: 18, color: 0x3a6a3a }).container);
    c.add(button(this, x + 412, y + h - 64, 100, 46, t('title.export'), () => exportSaveFile(save), { size: 14 }).container);
    c.add(button(this, x + 520, y + h - 64, 100, 46, t('title.delete'), () => {
      confirmBox(this, VIEW_W / 2, VIEW_H / 2, t('title.deleteConfirm', p), () => {
        void deleteSave(slot).then(() => this.scene.restart());
      });
    }, { size: 14, color: 0x5a2a2a }).container);
    c.add(button(this, x + w - 44, y + 10, 34, 30, '✕', close, { size: 14 }).container);
  }

  /** Empty slot: make a new character here, or import a save file into it. */
  private emptyBox(slot: number): void {
    const { c, x, y } = this.modal(420, 220);
    c.add(label(this, x + 210, y + 40, t('title.emptyTitle', { n: slot + 1 }), { size: 18, bold: true }).setOrigin(0.5));
    c.add(button(this, x + 40, y + 80, 340, 46, t('title.new'), () => this.scene.start('Create', { slot }), { size: 17 }).container);
    c.add(button(this, x + 40, y + 140, 160, 40, t('title.import'), () => {
      c.destroy();
      this.importSave(slot);
    }, { size: 14 }).container);
    c.add(button(this, x + 220, y + 140, 160, 40, t('ui.back'), () => c.destroy(), { size: 14 }).container);
  }

  private importSave(slot: number): void {
    pickSaveFile().then((data) => writeSave(slot, data).then(() => this.scene.restart())).catch((e: unknown) => {
      messageBox(this, VIEW_W / 2, VIEW_H / 2, t('settings.importFailed', { reason: e instanceof Error ? e.message : String(e) }));
    });
  }

  private showCredits(): void {
    showCreditsBox(this, VIEW_W / 2, VIEW_H / 2);
  }
}

/** What the saved character wears: its class look plus the sprites of its equipped items. */
function savedLayers(save: SaveData): string[] {
  return characterLayers(CONTENT.classes[save.player.classId].appearance, save.player.equipment);
}

function savedTime(save: SaveData): string {
  const d = new Date(save.savedAt);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function saveParams(save: SaveData): Record<string, string | number> {
  const map = save.mapId === 'village' ? 'map.village' : `map.${save.mapId}`;
  const cls = CONTENT.classes[save.player.classId].nameKey;
  return { name: save.player.name || cls, class: cls, level: save.player.level, map };
}

export function showCreditsBox(scene: Phaser.Scene, cx: number, cy: number): void {
  const w = 560;
  const h = 130 + credits.length * 52;
  const shade = scene.add.rectangle(-4000, -4000, 12000, 12000, 0x000000, 0.6).setOrigin(0);
  blockInput(scene, shade);
  const box = scene.add.rectangle(cx, cy, w, h, COLORS.panel).setStrokeStyle(2, COLORS.panelEdge);
  const c = scene.add.container(0, 0, [shade, box]).setDepth(1000);
  c.add(label(scene, cx, cy - h / 2 + 24, t('credits.title'), { size: 18, bold: true }).setOrigin(0.5));
  credits.forEach((cr, i) => {
    c.add(label(scene, cx - w / 2 + 24, cy - h / 2 + 56 + i * 52, `${cr.what}\n${cr.who}（${cr.license}）`, { size: 13, wrap: w - 48 }));
  });
  c.add(button(scene, cx - 60, cy + h / 2 - 54, 120, 40, t('ui.close'), () => c.destroy()).container);
}
