// Full-screen menu scenes (title, character creation) lay out a 1024x576 logical box,
// centered and scaled like the map view, and rebuild themselves when the screen size changes.
import Phaser from 'phaser';
import { computeLayout, VIEW_H, VIEW_W } from '../render/view';
import { t } from './strings';
import { blockInput, button, COLORS, label, setTextResolution } from './widgets';

export function setupMenuCamera(scene: Phaser.Scene): void {
  const layout = computeLayout(scene.scale.width, scene.scale.height);
  setTextResolution(layout.zoom);
  const cam = scene.cameras.main;
  cam.setViewport(0, 0, layout.canvasW, layout.canvasH).setOrigin(0, 0).setZoom(layout.zoom);
  cam.setScroll(-(layout.uiW - VIEW_W) / 2, -(layout.uiH - VIEW_H) / 2);
  cam.setBackgroundColor('#141420');
  const onResize = () => scene.scene.restart(scene.sys.settings.data);
  scene.scale.once(Phaser.Scale.Events.RESIZE, onResize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, onResize));
}

/** Modal yes/no box centered on (cx, cy); a full-screen shade swallows other input. */
export function confirmBox(
  scene: Phaser.Scene, cx: number, cy: number, text: string, onYes: () => void,
): Phaser.GameObjects.Container {
  const shade = scene.add.rectangle(-4000, -4000, 12000, 12000, 0x000000, 0.6).setOrigin(0);
  blockInput(scene, shade);
  const box = scene.add.rectangle(cx, cy, 460, 190, COLORS.panel).setStrokeStyle(2, COLORS.panelEdge);
  const tx = label(scene, cx, cy - 40, text, { size: 16, wrap: 420, align: 'center' }).setOrigin(0.5);
  const c = scene.add.container(0, 0, [shade, box, tx]).setDepth(1000);
  const close = () => c.destroy();
  c.add(button(scene, cx - 170, cy + 30, 150, 44, t('ui.yes'), () => { close(); onYes(); }).container);
  c.add(button(scene, cx + 20, cy + 30, 150, 44, t('ui.no'), close).container);
  return c;
}

/** Modal message box with a single close button. */
export function messageBox(scene: Phaser.Scene, cx: number, cy: number, text: string): Phaser.GameObjects.Container {
  const shade = scene.add.rectangle(-4000, -4000, 12000, 12000, 0x000000, 0.6).setOrigin(0);
  blockInput(scene, shade);
  const box = scene.add.rectangle(cx, cy, 460, 170, COLORS.panel).setStrokeStyle(2, COLORS.panelEdge);
  const tx = label(scene, cx, cy - 30, text, { size: 16, wrap: 420, align: 'center' }).setOrigin(0.5);
  const c = scene.add.container(0, 0, [shade, box, tx]).setDepth(1000);
  c.add(button(scene, cx - 75, cy + 25, 150, 44, t('ui.confirm'), () => c.destroy()).container);
  return c;
}
