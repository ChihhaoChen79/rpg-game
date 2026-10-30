// All UI text comes from the strings file (plan §4 rule 7).
import strings from '../../data/strings.zh-TW.json';

export type StringKey = keyof typeof strings;
const table = strings as Record<string, string>;

/**
 * Look up a string; `{name}` placeholders are replaced from params. A param that is itself a
 * strings key (e.g. "item.arrow") is translated too. Unknown keys return the key.
 */
export function t(key: StringKey | string, params?: Record<string, string | number>): string {
  let s = table[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const val = typeof v === 'string' && table[v] !== undefined ? table[v]! : String(v);
      s = s.replaceAll(`{${k}}`, val);
    }
  }
  return s;
}

/** Fusion Pixel (bundled, see BootScene); characters it lacks fall back to the system CJK fonts. */
export const PIXEL_FONT = 'Fusion Pixel TC';
export const UI_FONT = `"${PIXEL_FONT}", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif`;
