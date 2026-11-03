// All UI text comes from the strings file (plan §4 rule 7).
import strings from '../../data/strings.zh-TW.json';

export type StringKey = keyof typeof strings;
const table = strings as Record<string, string>;

/**
 * Look up a string; `{name}` placeholders are replaced from params. A param that is itself a
 * strings key (e.g. "item.arrow") is translated too. Unknown keys return the key.
 */
/** A whole number with a comma every 3 digits: 1234567 -> "1,234,567". */
export function num(n: number): string {
  return Number.isFinite(n) && Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en') : String(n);
}

/** A number with one decimal and commas: 4680 -> "4,680.0". */
export function num1(n: number): string {
  return n.toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function t(key: StringKey | string, params?: Record<string, string | number>): string {
  let s = table[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const val = typeof v === 'string' && table[v] !== undefined ? table[v]! : typeof v === 'number' ? num(v) : String(v);
      s = s.replaceAll(`{${k}}`, val);
    }
  }
  return s;
}

/** Fusion Pixel (bundled, see BootScene); characters it lacks fall back to the system CJK fonts. */
export const PIXEL_FONT = 'Fusion Pixel TC';
export const UI_FONT = `"${PIXEL_FONT}", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif`;
