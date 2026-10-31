// Tap-to-type number box: an HTML text box laid over a Phaser rectangle, so phones show their
// number keyboard. One at a time; Enter, Escape or a tap elsewhere closes it.
import Phaser from 'phaser';
import { afterTap } from '../input/afterTap';
import { UI_FONT } from './strings';

export interface NumberBoxOptions {
  value: number;
  max: number;
  onInput?(n: number): void; // every keystroke (already capped at max)
  onClose?(n: number): void; // when it closes, with the final number
}

export interface NumberBox {
  close(): void;
}

let current: { el: HTMLInputElement; close(): void } | null = null;

/** Close the open number box, if any (its onClose runs). */
export function closeNumberBox(): void {
  current?.close();
}

export function openNumberBox(scene: Phaser.Scene, box: Phaser.GameObjects.Rectangle, o: NumberBoxOptions): NumberBox {
  closeNumberBox();
  const el = document.createElement('input');
  el.type = 'text';
  el.inputMode = 'numeric';
  el.pattern = '[0-9]*';
  el.autocomplete = 'off';
  el.value = o.value > 0 ? String(o.value) : '';
  // Where the box is on screen: world -> camera -> canvas -> page.
  const cam = scene.cameras.main;
  const m = box.getWorldTransformMatrix();
  const canvas = scene.game.canvas;
  const cr = canvas.getBoundingClientRect();
  const css = cr.width / canvas.width;
  // Phaser's camera: screen = x + origin + (world - scroll - origin) * zoom
  const ox = cam.originX * cam.width;
  const oy = cam.originY * cam.height;
  const pt = { x: cam.x + ox + (m.tx - cam.scrollX - ox) * cam.zoom, y: cam.y + oy + (m.ty - cam.scrollY - oy) * cam.zoom };
  Object.assign(el.style, {
    position: 'fixed', boxSizing: 'border-box', left: `${cr.left + pt.x * css}px`, top: `${cr.top + pt.y * css}px`,
    width: `${box.width * cam.zoom * css}px`, height: `${box.height * cam.zoom * css}px`, padding: '0 2px',
    // 16px minimum: iPhone Safari zooms the page into smaller inputs.
    fontSize: `${Math.max(16, 15 * cam.zoom * css)}px`, fontFamily: UI_FONT, textAlign: 'center',
    color: '#ffffff', background: '#22223a', border: '2px solid #ffd060', borderRadius: '3px', outline: 'none', zIndex: '10',
  });
  let n = o.value;
  el.addEventListener('input', () => {
    const digits = el.value.replace(/\D/g, '').slice(0, 5);
    n = Math.min(digits ? Number(digits) : 0, o.max);
    el.value = digits === '' ? '' : String(n);
    o.onInput?.(n);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') el.blur();
  });
  const me = {
    el,
    close() {
      if (current !== me) return;
      current = null;
      el.remove();
      o.onClose?.(n);
    },
  };
  el.addEventListener('blur', () => me.close());
  document.body.appendChild(el);
  current = me;
  // iPhone only shows the keyboard for a focus from a real tap (finger lifted).
  afterTap(() => {
    if (current !== me) return;
    el.focus();
    el.select();
  });
  return { close: () => me.close() };
}
