// Full-screen menu scenes (title, character creation) lay out a "stage": 1024x576 logical px in
// landscape, centered and scaled like the map view, or a 512 px wide column as tall as the screen
// in portrait. They rebuild themselves when the screen size changes.
import Phaser from 'phaser';
import { computeMenuLayout, type MenuLayout } from '../render/view';
import { t } from './strings';
import { blockInput, button, COLORS, label, setTextResolution } from './widgets';

export function setupMenuCamera(scene: Phaser.Scene): MenuLayout {
  const layout = computeMenuLayout(scene.scale.width, scene.scale.height);
  setTextResolution(layout.zoom);
  const cam = scene.cameras.main;
  cam.setViewport(0, 0, scene.scale.width, scene.scale.height).setOrigin(0, 0).setZoom(layout.zoom);
  cam.setScroll(-(layout.uiW - layout.stageW) / 2, -(layout.uiH - layout.stageH) / 2);
  cam.setBackgroundColor('#141420');
  // Rebuild only when the canvas size really changed, and never while a text box has focus: the
  // phone keyboard fires resize events, and a rebuild would remove the box and close the keyboard.
  const w = scene.scale.width;
  const h = scene.scale.height;
  const check = () => {
    if (document.activeElement instanceof HTMLInputElement) return;
    if (scene.scale.width !== w || scene.scale.height !== h) scene.scene.restart(scene.sys.settings.data);
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, check);
  window.addEventListener('focusout', check);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, check);
    window.removeEventListener('focusout', check);
  });
  return layout;
}

/** Modal yes/no box centered on (cx, cy); a full-screen shade swallows other input. */
export function confirmBox(
  scene: Phaser.Scene, cx: number, cy: number, text: string, onYes: () => void,
): Phaser.GameObjects.Container {
  const shade = scene.add.rectangle(-4000, -4000, 12000, 12000, 0x000000, 0.6).setOrigin(0);
  blockInput(scene, shade);
  const w = Math.min(460, cx * 2 - 24); // narrower on a portrait screen
  const box = scene.add.rectangle(cx, cy, w, 190, COLORS.panel).setStrokeStyle(2, COLORS.panelEdge);
  const tx = label(scene, cx, cy - 40, text, { size: 16, wrap: w - 40, align: 'center' }).setOrigin(0.5);
  const c = scene.add.container(0, 0, [shade, box, tx]).setDepth(1000);
  const close = () => c.destroy();
  const bw = Math.min(150, w * 0.33);
  c.add(button(scene, cx - 20 - bw, cy + 30, bw, 44, t('ui.yes'), () => { close(); onYes(); }).container);
  c.add(button(scene, cx + 20, cy + 30, bw, 44, t('ui.no'), close).container);
  return c;
}

/** Modal message box with a single close button. */
export function messageBox(scene: Phaser.Scene, cx: number, cy: number, text: string): Phaser.GameObjects.Container {
  const shade = scene.add.rectangle(-4000, -4000, 12000, 12000, 0x000000, 0.6).setOrigin(0);
  blockInput(scene, shade);
  const w = Math.min(460, cx * 2 - 24);
  const box = scene.add.rectangle(cx, cy, w, 170, COLORS.panel).setStrokeStyle(2, COLORS.panelEdge);
  const tx = label(scene, cx, cy - 30, text, { size: 16, wrap: w - 40, align: 'center' }).setOrigin(0.5);
  const c = scene.add.container(0, 0, [shade, box, tx]).setDepth(1000);
  c.add(button(scene, cx - 75, cy + 25, 150, 44, t('ui.confirm'), () => c.destroy()).container);
  return c;
}
