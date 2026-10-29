// Title screen (plan §7.20): Continue (if a save exists), New Character, import save, credits.
import Phaser from 'phaser';
import credits from '../../data/credits.json';
import { CONTENT } from '../content';
import type { SaveData } from '../logic/save';
import { CLASS_IDS } from '../logic/types';
import { CharacterView, startingLayers } from '../render/character';
import { VIEW_H, VIEW_W } from '../render/view';
import { deleteSave, exportSaveFile, loadSave, pickSaveFile, requestPersistentStorage, writeSave } from '../save/storage';
import { confirmBox, messageBox, setupMenuCamera } from './menuLayout';
import { t } from './strings';
import { blockInput, button, COLORS, label } from './widgets';

export class TitleScene extends Phaser.Scene {
  private save: SaveData | null = null;

  constructor() {
    super('Title');
  }

  create(): void {
    setupMenuCamera(this);
    requestPersistentStorage();
    const cx = VIEW_W / 2;

    // Decorative ground strip with the three heroes.
    this.add.rectangle(0, 210, VIEW_W, 80, 0x4e8a42).setOrigin(0);
    this.add.rectangle(0, 286, VIEW_W, 6, 0x3b6c32).setOrigin(0);
    CLASS_IDS.forEach((cls, i) => {
      new CharacterView(this, cx + (i - 1) * 110, 260, startingLayers(cls)).setScale(2).update(0);
    });

    label(this, cx, 110, t('app.title'), { size: 56, bold: true, stroke: true, color: '#ffe9a8' }).setOrigin(0.5);

    const cont = button(this, cx - 130, 320, 260, 46, t('title.continue'), () => this.continueGame(), { size: 18, enabled: false });
    const info = label(this, cx, 376, t('title.noSave'), { size: 13, color: '#a8a8c0' }).setOrigin(0.5);
    button(this, cx - 130, 394, 260, 46, t('title.new'), () => this.newCharacter(), { size: 18 });
    button(this, cx - 130, 450, 125, 40, t('title.import'), () => this.importSave(), { size: 14 });
    const exp = button(this, cx + 5, 450, 125, 40, t('title.export'), () => this.save && exportSaveFile(this.save), { size: 14, enabled: false });
    button(this, cx - 130, 498, 125, 36, t('title.credits'), () => this.showCredits(), { size: 14 });
    const del = button(this, cx + 5, 498, 125, 36, t('title.delete'), () => this.deleteSave(), { size: 14, enabled: false, color: 0x5a2a2a });
    label(this, VIEW_W - 8, VIEW_H - 8, `${t('title.version')} ${__APP_VERSION__}`, { size: 11, color: '#6a6a80' }).setOrigin(1);

    void loadSave().then((save) => {
      if (!this.sys.isActive()) return;
      this.save = save;
      cont.setEnabled(!!save);
      del.setEnabled(!!save);
      exp.setEnabled(!!save);
      if (save) info.setText(t('title.saveInfo', saveParams(save)));
    });
  }

  private continueGame(): void {
    if (!this.save) return;
    this.scene.start('World', { save: this.save });
  }

  private newCharacter(): void {
    if (!this.save) {
      this.scene.start('Create');
      return;
    }
    confirmBox(this, VIEW_W / 2, VIEW_H / 2, t('title.overwrite', saveParams(this.save)), () => this.scene.start('Create'));
  }

  private deleteSave(): void {
    if (!this.save) return;
    confirmBox(this, VIEW_W / 2, VIEW_H / 2, t('title.deleteConfirm', saveParams(this.save)), () => {
      void deleteSave().then(() => this.scene.restart());
    });
  }

  private importSave(): void {
    pickSaveFile().then((data) => {
      const apply = () => writeSave(data).then(() => this.scene.restart());
      if (this.save) confirmBox(this, VIEW_W / 2, VIEW_H / 2, t('settings.importConfirm'), () => void apply());
      else void apply();
    }).catch((e: unknown) => {
      messageBox(this, VIEW_W / 2, VIEW_H / 2, t('settings.importFailed', { reason: e instanceof Error ? e.message : String(e) }));
    });
  }

  private showCredits(): void {
    showCreditsBox(this, VIEW_W / 2, VIEW_H / 2);
  }
}

export function saveParams(save: SaveData): Record<string, string | number> {
  const map = save.mapId === 'village' ? 'map.village' : `map.${save.mapId}`;
  const cls = CONTENT.classes[save.player.classId].nameKey;
  return { name: save.player.name || cls, class: cls, level: save.player.level, map };
}

export function showCreditsBox(scene: Phaser.Scene, cx: number, cy: number): void {
  const w = 560;
  const h = 300;
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
