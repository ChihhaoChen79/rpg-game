import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { BootScene } from './render/BootScene';
import { WorldScene } from './render/WorldScene';
import { CreateScene } from './ui/CreateScene';
import { HudScene } from './ui/HudScene';
import { TitleScene } from './ui/TitleScene';
import { t } from './ui/strings';
import { unlockAudio } from './audio/audio';

const container = document.getElementById('game')!;

/** Physical-pixel size of the game container (it is position:fixed and fills the screen). */
function physicalSize(): { w: number; h: number; dpr: number } {
  const dpr = window.devicePixelRatio || 1;
  const r = container.getBoundingClientRect();
  const cssW = r.width || window.innerWidth;
  const cssH = r.height || window.innerHeight;
  return { w: Math.round(cssW * dpr), h: Math.round(cssH * dpr), dpr };
}

// Render at physical-pixel resolution, CSS-scaled back down (plan §6), so pixels stay sharp.
const size = physicalSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: container,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  width: size.w,
  height: size.h,
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / size.dpr },
  input: { activePointers: 2 },
  scene: [BootScene, TitleScene, CreateScene, WorldScene, HudScene],
});

// Keep the canvas matched to the screen. Phone browsers don't reliably fire `resize` on
// rotation, or fire it before the new size is readable, which left a portrait-shaped canvas
// (mostly black) after turning the phone to landscape. So compare sizes every frame; the
// check is a single getBoundingClientRect and only resizes when something changed.
function syncSize(): void {
  // iPhone Safari scrolls the page to show a focused text box and may leave it scrolled after
  // the keyboard closes; that shifted the picture and made taps land in the wrong place.
  const typing = document.activeElement instanceof HTMLInputElement;
  if (!typing && (window.scrollX !== 0 || window.scrollY !== 0)) window.scrollTo(0, 0);
  const r = game.canvas.getBoundingClientRect();
  const b = game.scale.canvasBounds;
  if (Math.abs(r.left - b.x) > 0.5 || Math.abs(r.top - b.y) > 0.5) game.scale.updateBounds();
  const s = physicalSize();
  if (s.w <= 0 || s.h <= 0) return;
  if (s.w === game.scale.width && s.h === game.scale.height && game.scale.zoom === 1 / s.dpr) return;
  game.scale.resize(s.w, s.h);
  game.scale.setZoom(1 / s.dpr);
}
game.events.on(Phaser.Core.Events.PRE_STEP, syncSize);

// Sound may only start after a user gesture (iPhone in particular).
for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(ev, unlockAudio, { passive: true });

// Middle-click uses the selected hotbar slot; stop the browser's autoscroll from taking it.
game.canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1) e.preventDefault();
});

// DOM overlays take their text from the strings file too.
document.title = t('app.title');
document.getElementById('rotate')!.textContent = t('ui.rotate');
const updateBox = document.getElementById('update')!;
updateBox.querySelector('span')!.textContent = t('ui.updateAvailable');
const reloadBtn = updateBox.querySelector('button')!;
reloadBtn.textContent = t('ui.reload');

// PWA: offer a reload when a new version is deployed (plan §11).
const updateSW = registerSW({
  onNeedRefresh() {
    updateBox.style.display = 'block';
  },
});
reloadBtn.addEventListener('click', () => void updateSW(true));

// Best-effort landscape lock; only works in fullscreen/installed mode on some browsers.
window.addEventListener('pointerdown', () => {
  // screen.orientation is missing on older iOS Safari.
  const o = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
  o?.lock?.('landscape').catch(() => {});
}, { once: true });

// Dev builds: expose the game for the browser console and automated checks.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
