// All UI text comes from the strings file (plan §4 rule 7).
import strings from '../../data/strings.zh-TW.json';

export type StringKey = keyof typeof strings;

/** Look up a string; `{name}` placeholders are replaced from params. Unknown keys return the key. */
export function t(key: StringKey | string, params?: Record<string, string | number>): string {
  let s = (strings as Record<string, string>)[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const UI_FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
