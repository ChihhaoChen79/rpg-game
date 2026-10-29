// Player name color from Alignment: white at 0, turning gradually blue for good and red for evil,
// fully colored at ±fullAt (balance.nameColorFullAt).

const WHITE = [255, 255, 255];
const GOOD = [74, 140, 255]; // blue
const EVIL = [255, 64, 64]; // red

/** CSS color string, e.g. "#ffffff". */
export function nameColor(alignment: number, fullAt: number): string {
  const f = Math.min(1, Math.abs(alignment) / Math.max(1, fullAt));
  const to = alignment >= 0 ? GOOD : EVIL;
  const c = WHITE.map((w, i) => Math.round(w + (to[i]! - w) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
