// Character creation (plan §7.2): name, class, and 6 bonus points (max 18 per stat).
import Phaser from 'phaser';
import { CONTENT, START_MAP } from '../content';
import { BONUS_POINTS, cleanName, MAX_START_STAT, NAME_MAX } from '../logic/player';
import { CLASS_IDS, STAT_KEYS, type ClassId, type SharedStorage, type Stats } from '../logic/types';
import { CharacterView, startingLayers } from '../render/character';
import { computeLayout, VIEW_H, VIEW_W } from '../render/view';
import { setupMenuCamera } from './menuLayout';
import { t, UI_FONT } from './strings';
import { button, COLORS, label, type Button } from './widgets';

export class CreateScene extends Phaser.Scene {
  private classId: ClassId = 'knight';
  private stats: Stats = { ...CONTENT.classes.knight.base };
  private refresh: () => void = () => {};
  private views: CharacterView[] = [];
  private name = ''; // kept when the scene restarts on resize
  private placeInput: () => void = () => {};

  constructor() {
    super('Create');
  }

  create(): void {
    setupMenuCamera(this);
    label(this, VIEW_W / 2, 30, t('create.title'), { size: 26, bold: true, stroke: true }).setOrigin(0.5);

    // Class cards
    const cards: { cls: ClassId; frame: Phaser.GameObjects.Rectangle; view: CharacterView }[] = [];
    this.views = [];
    CLASS_IDS.forEach((cls, i) => {
      const x = 40 + i * 320;
      const frame = this.add.rectangle(x, 60, 300, 200, COLORS.panel).setOrigin(0).setStrokeStyle(2, COLORS.panelEdge);
      frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.pickClass(cls));
      const view = new CharacterView(this, x + 60, 186, startingLayers(cls)).setScale(2);
      this.views.push(view);
      label(this, x + 120, 76, t(CONTENT.classes[cls].nameKey), { size: 20, bold: true });
      label(this, x + 120, 108, t(CONTENT.classes[cls].descKey), { size: 13, wrap: 170, color: '#cfcfe0' });
      cards.push({ cls, frame, view });
    });

    // Stats
    label(this, 60, 280, t('create.hint'), { size: 14, color: '#cfcfe0' });
    const pointsText = label(this, 60, 304, '', { size: 16, bold: true, color: '#ffe08a' });
    const rows: { value: Phaser.GameObjects.Text; minus: Button; plus: Button }[] = [];
    STAT_KEYS.forEach((k, i) => {
      const y = 334 + i * 42;
      label(this, 60, y + 8, t(`stat.${k}`), { size: 17 });
      label(this, 126, y + 11, t(`stat.${k}.desc`), { size: 12, color: '#9a9ab4' });
      const minus = button(this, 330, y, 40, 34, '−', () => this.adjust(k, -1), { size: 18 });
      const value = label(this, 400, y + 17, '', { size: 18, bold: true, align: 'center' }).setOrigin(0.5);
      const plus = button(this, 430, y, 40, 34, '+', () => this.adjust(k, 1), { size: 18 });
      rows.push({ value, minus, plus });
    });
    // Name: a real <input> over the canvas, so phones show their keyboard.
    label(this, 540, 272, t('create.name'), { size: 15 });
    const input = this.nameInput(540, 296, 300, 38);
    input.addEventListener('input', () => {
      this.name = input.value;
      this.refresh();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.startGame();
    });
    const preview = label(this, 540, 346, '', { size: 16 });
    button(this, 540, 384, 160, 40, t('create.reset'), () => this.pickClass(this.classId), { size: 15 });
    button(this, 540, 520, 160, 44, t('ui.back'), () => this.scene.start('Title'), { size: 16 });
    const start = button(this, 740, 520, 240, 44, t('create.start'), () => this.startGame(), { size: 18 });

    this.refresh = () => {
      const base = CONTENT.classes[this.classId].base;
      const left = this.pointsLeft();
      pointsText.setText(t('create.points', { n: left }));
      STAT_KEYS.forEach((k, i) => {
        const r = rows[i]!;
        r.value.setText(String(this.stats[k]));
        r.value.setColor(this.stats[k] > base[k] ? '#9fe09a' : '#f0f0f0');
        r.minus.setEnabled(this.stats[k] > base[k]);
        r.plus.setEnabled(left > 0 && this.stats[k] < MAX_START_STAT);
      });
      const cls = CONTENT.classes[this.classId];
      preview.setText(t('create.preview', { hp: cls.baseHp + this.stats.con, mp: cls.baseMp + Math.floor(this.stats.int / 2) }));
      start.setEnabled(left === 0 && cleanName(this.name) !== '');
      for (const c of cards) {
        const on = c.cls === this.classId;
        c.frame.setStrokeStyle(on ? 3 : 2, on ? COLORS.select : COLORS.panelEdge);
        c.view.setWalking(on);
      }
    };
    this.pickClass(this.classId);
  }

  update(): void {
    for (const v of this.views) v.update(this.time.now);
    this.placeInput();
  }

  private pointsLeft(): number {
    const base = CONTENT.classes[this.classId].base;
    return BONUS_POINTS - STAT_KEYS.reduce((n, k) => n + this.stats[k] - base[k], 0);
  }

  private pickClass(cls: ClassId): void {
    this.classId = cls;
    this.stats = { ...CONTENT.classes[cls].base };
    this.refresh();
  }

  private adjust(k: keyof Stats, d: number): void {
    const base = CONTENT.classes[this.classId].base;
    const v = this.stats[k] + d;
    if (v < base[k] || v > MAX_START_STAT || (d > 0 && this.pointsLeft() <= 0)) return;
    this.stats[k] = v;
    this.refresh();
  }

  /** An HTML text box placed over the scene rectangle (x, y, w, h); removed when the scene stops. */
  private nameInput(x: number, y: number, w: number, h: number): HTMLInputElement {
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = NAME_MAX * 2; // surrogate pairs; cleanName enforces the real limit
    el.placeholder = t('create.namePlaceholder', { n: NAME_MAX });
    el.value = this.name;
    el.autocomplete = 'off';
    el.spellcheck = false;
    Object.assign(el.style, {
      position: 'fixed', boxSizing: 'border-box', padding: '0 8px', fontFamily: UI_FONT,
      color: '#f0f0f0', background: '#22223a', border: '2px solid #6a6aa0', borderRadius: '4px', outline: 'none',
      zIndex: '10',
    });
    // Placed from where the canvas really is on screen, but never while it has focus: iPhone Safari
    // scrolls the page to show a focused box, and moving the box then made Safari scroll again
    // until it gave up and closed the keyboard.
    let last = '';
    this.placeInput = () => {
      if (document.activeElement === el) return;
      const L = computeLayout(this.scale.width, this.scale.height);
      const canvas = this.game.canvas;
      const r = canvas.getBoundingClientRect();
      const css = r.width / canvas.width; // CSS px per canvas px
      // Same mapping as setupMenuCamera: logical px -> canvas px.
      const left = r.left + (x + (L.uiW - VIEW_W) / 2) * L.zoom * css;
      const top = r.top + (y + (L.uiH - VIEW_H) / 2) * L.zoom * css;
      const key = `${left}|${top}|${css}|${L.zoom}`;
      if (key === last) return;
      last = key;
      Object.assign(el.style, {
        left: `${left}px`, top: `${top}px`, width: `${w * L.zoom * css}px`, height: `${h * L.zoom * css}px`,
        // 16px minimum: iPhone Safari zooms the page into smaller inputs.
        fontSize: `${Math.max(16, 17 * L.zoom * css)}px`,
      });
    };
    this.placeInput();
    // When the keyboard closes, put the page back where it was.
    el.addEventListener('blur', () => {
      window.scrollTo(0, 0);
      this.scale.updateBounds();
      last = '';
      this.placeInput();
    });
    document.body.appendChild(el);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      el.remove();
      this.placeInput = () => {};
    });
    return el;
  }

  private startGame(): void {
    const name = cleanName(this.name);
    if (this.pointsLeft() !== 0 || !name) return;
    const data = this.scene.settings.data as { slot?: number; shared?: SharedStorage } | undefined;
    const slot = data?.slot ?? 0;
    this.scene.start('World', { slot, shared: data?.shared, newCharacter: { name, classId: this.classId, stats: { ...this.stats }, startMap: START_MAP } });
  }
}
