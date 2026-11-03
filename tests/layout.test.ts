import { describe, expect, it } from 'vitest';
import { computeLayout, computePlayLayout, isPortrait, PORTRAIT_VIEW, VIEW_H, VIEW_W } from '../src/render/view';

describe('screen layout', () => {
  it('landscape screens (phone, PC) keep the 32x18 view and side panels, as before', () => {
    for (const [w, h] of [[1920, 1080], [1280, 720], [1688, 780], [1024, 768], [2532, 1170]] as const) {
      const a = computePlayLayout(w, h);
      expect(a).toEqual(computeLayout(w, h));
      expect(a.portrait).toBe(false);
      expect(a.viewW).toBe(VIEW_W);
      expect(a.viewH).toBe(VIEW_H);
    }
  });

  it('a portrait phone gets a 16x14-tile map view on top, full width, and room below for the UI', () => {
    for (const [w, h] of [[1170, 2532], [780, 1688], [1080, 2400]] as const) {
      expect(isPortrait(w, h)).toBe(true);
      const L = computePlayLayout(w, h);
      expect(L.portrait).toBe(true);
      expect(L.viewW).toBe(PORTRAIT_VIEW);
      expect(L.mapW).toBeCloseTo(w, -1); // fills the width
      expect(L.mapY).toBe(0);
      expect(L.uiH - L.viewH).toBeGreaterThan(340); // status, log, hotbar and the menu row fit below
    }
  });

  it('a square-ish window is not portrait', () => {
    expect(isPortrait(1000, 1000)).toBe(false);
  });
});

describe('menu screens layout', () => {
  it('landscape keeps the 1024x576 stage; portrait is a 512-wide column at least 880 tall', async () => {
    const { computeMenuLayout } = await import('../src/render/view');
    const l = computeMenuLayout(1280, 720);
    expect([l.portrait, l.stageW, l.stageH]).toEqual([false, 1024, 576]);
    for (const [w, h] of [[1170, 2532], [780, 1688]] as const) {
      const p = computeMenuLayout(w, h);
      expect(p.portrait).toBe(true);
      expect(p.stageW).toBe(512);
      expect(p.stageH).toBeGreaterThanOrEqual(880);
    }
  });
});

describe('numbers with a comma every 3 digits', () => {
  it('formats big numbers in strings and helpers', async () => {
    const { num, num1, t } = await import('../src/ui/strings');
    expect(num(999)).toBe('999');
    expect(num(1000)).toBe('1,000');
    expect(num(1234567)).toBe('1,234,567');
    expect(num(-12345)).toBe('-12,345');
    expect(num1(4680)).toBe('4,680.0');
    expect(t('hud.gold', { n: 185421 })).toContain('185,421');
  });
});
