import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { BootScene } from './render/BootScene';
import { WorldScene } from './render/WorldScene';
import { HudScene } from './ui/HudScene';
import { t } from './ui/strings';

function physicalSize(): { w: number; h: number; dpr: number } {
  const dpr = window.devicePixelRatio || 1;
  return { w: Math.round(window.innerWidth * dpr), h: Math.round(window.innerHeight * dpr), dpr };
}

// Render at physical-pixel resolution, CSS-scaled back down (plan §6), so pixels stay sharp.
const size = physicalSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  width: size.w,
  height: size.h,
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / size.dpr },
  input: { activePointers: 2 },
  scene: [BootScene, WorldScene, HudScene],
});

function onResize(): void {
  const s = physicalSize();
  game.scale.resize(s.w, s.h);
  game.scale.setZoom(1 / s.dpr);
}
window.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);

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
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  o.lock?.('landscape').catch(() => {});
}, { once: true });

// Dev builds: expose the game for the browser console and automated checks.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
