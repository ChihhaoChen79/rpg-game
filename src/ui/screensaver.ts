// Screensaver while auto-hunting (owner's request 2026-10-31): after a while without touching
// the screen, a dark page with the character walking in the middle, where they are, their level
// and what was earned since it came up. It is an HTML layer over everything, so it also works in
// portrait (where the game itself only asks to turn the phone). A tap closes it.
import Phaser from 'phaser';
import { CONTENT } from '../content';
import { derive } from '../logic/stats';
import type { GameState } from '../logic/types';
import { characterLayers, layerTexture, LPC_ANIMS, LPC_COLUMNS, LPC_FRAME, sortForFront } from '../render/character';
import { t, UI_FONT } from './strings';

const PREF_KEY = 'rpg-game:screensaver';
const SEP = '\u3000'; // full-width space between items on one line
/** No touch, click or key for this long while auto-hunting brings the screensaver up. */
export const SCREENSAVER_IDLE_MS = 20_000;
const SCALE = 3; // character drawn at 3x
const WALK_DOWN_ROW = LPC_ANIMS.walk.row + 2; // LPC rows: up, left, down, right

/** Remembered on this device only (a display preference, not game state). Default: on. */
export function screensaverPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setScreensaverPref(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the setting just won't be remembered
  }
}

export interface Screensaver {
  /** Call every frame: shows the screensaver when it's time, and refreshes it while shown. */
  update(s: GameState, now: number): void;
  /** A monster died (counted while the screensaver is up). */
  onKill(): void;
  destroy(): void;
}

export function createScreensaver(scene: Phaser.Scene): Screensaver {
  let lastActivity = performance.now();
  const activity = () => {
    lastActivity = performance.now();
  };
  const events = ['pointerdown', 'touchstart', 'keydown', 'wheel'] as const;
  for (const ev of events) window.addEventListener(ev, activity, { capture: true, passive: true });

  let root: HTMLDivElement | null = null;
  let start = { time: 0, gold: 0, exp: 0, level: 0 };
  let kills = 0;
  let layersKey = '';
  let lastInfo = 0;
  const parts: Record<string, HTMLElement> = {};
  let figure: HTMLCanvasElement | null = null;
  let images: { img: CanvasImageSource }[] = [];

  const show = (s: GameState, now: number) => {
    const p = s.player;
    start = { time: now, gold: p.gold, exp: p.exp, level: p.level };
    kills = 0;
    root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed', inset: '0', zIndex: '40', background: '#05050a', color: '#d8d8e8',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px',
      fontFamily: UI_FONT, textAlign: 'center', userSelect: 'none', cursor: 'pointer',
      padding: 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)',
    });
    const line = (key: string, size: number, color: string) => {
      const el = document.createElement('div');
      Object.assign(el.style, { fontSize: `${size}px`, color, lineHeight: '1.35', padding: '0 16px' });
      parts[key] = el;
      return el;
    };
    figure = document.createElement('canvas');
    figure.width = LPC_FRAME;
    figure.height = LPC_FRAME;
    Object.assign(figure.style, { width: `${LPC_FRAME * SCALE}px`, height: `${LPC_FRAME * SCALE}px`, imageRendering: 'pixelated' });
    root.append(
      line('who', 20, '#ffe9a8'),
      line('where', 15, '#a8c8ff'),
      figure,
      line('status', 15, '#d8d8e8'),
      line('gains', 17, '#9fe09a'),
      line('time', 13, '#8888a0'),
      line('hint', 12, '#606078'),
    );
    parts.hint!.textContent = t('saver.hint');
    // A tap only closes it (doesn't reach the game underneath).
    const close = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      hide();
      lastActivity = performance.now();
    };
    root.addEventListener('pointerdown', close);
    root.addEventListener('touchstart', close, { passive: false });
    document.body.appendChild(root);
    layersKey = '';
    lastInfo = 0;
  };

  const hide = () => {
    root?.remove();
    root = null;
    figure = null;
  };

  /** Character layers in front-facing draw order, as images from the loaded textures. */
  const loadLayers = (s: GameState) => {
    const p = s.player;
    const names = sortForFront(characterLayers(CONTENT.classes[p.classId].appearance, p.equipment));
    const key = names.join('|');
    if (key === layersKey) return;
    layersKey = key;
    images = names
      .filter((n) => scene.textures.exists(layerTexture(n)))
      .map((n) => ({ img: scene.textures.get(layerTexture(n)).getSourceImage() as CanvasImageSource }));
  };

  const drawFigure = (now: number) => {
    const ctx = figure?.getContext('2d');
    if (!ctx) return;
    const frame = 1 + (Math.floor(now / 110) % 8); // walking on the spot, facing the viewer
    ctx.clearRect(0, 0, LPC_FRAME, LPC_FRAME);
    ctx.imageSmoothingEnabled = false;
    const sx = (frame % LPC_COLUMNS) * LPC_FRAME;
    const sy = WALK_DOWN_ROW * LPC_FRAME;
    for (const { img } of images) ctx.drawImage(img, sx, sy, LPC_FRAME, LPC_FRAME, 0, 0, LPC_FRAME, LPC_FRAME);
  };

  const fillInfo = (s: GameState, now: number) => {
    const p = s.player;
    const d = derive(CONTENT, p);
    const map = s.maps[s.mapId];
    const cls = t('title.classLevel', { class: t(CONTENT.classes[p.classId].nameKey), level: p.level });
    parts.who!.textContent = p.name ? `${p.name}${SEP}${cls}` : cls;
    parts.where!.textContent = t('saver.where', { map: map ? t(map.nameKey) : s.mapId, x: p.mover.x, y: p.mover.y });
    parts.status!.textContent = `HP ${p.hp}/${d.maxHp}${SEP}MP ${p.mp}/${d.maxMp}${SEP}${t(p.afk ? 'saver.afkOn' : 'saver.afkOff')}`;
    parts.status!.style.color = p.afk ? '#d8d8e8' : '#ff8a7a';
    const exp = p.exp - start.exp;
    const levels = p.level - start.level;
    parts.gains!.textContent = [
      t('saver.gold', { n: (p.gold - start.gold).toLocaleString('en') }),
      t('saver.exp', { n: `${exp >= 0 ? '+' : ''}${exp.toLocaleString('en')}` }) + (levels ? t('saver.levels', { n: `${levels > 0 ? '+' : ''}${levels}` }) : ''),
      t('saver.kills', { n: kills }),
    ].join(SEP);
    const sec = Math.floor((now - start.time) / 1000);
    const hh = Math.floor(sec / 3600);
    const mm = String(Math.floor(sec / 60) % 60).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    parts.time!.textContent = t('saver.time', { t: hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}` });
  };

  return {
    update(s, now) {
      if (!root) {
        if (s.player.afk && screensaverPref() && performance.now() - lastActivity >= SCREENSAVER_IDLE_MS) show(s, now);
        else return;
      }
      loadLayers(s);
      drawFigure(now);
      if (now - lastInfo >= 250) {
        lastInfo = now;
        fillInfo(s, now);
      }
    },
    onKill() {
      if (root) kills++;
    },
    destroy() {
      hide();
      for (const ev of events) window.removeEventListener(ev, activity, { capture: true });
    },
  };
}
