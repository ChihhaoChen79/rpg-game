// Minimal CSV (RFC 4180) reader/writer for the tuning sheets. Files are written as UTF-8 with
// a BOM so Excel shows Chinese text correctly.
const BOM = '﻿';

/** Parse CSV text into rows of strings (quotes, commas and newlines inside quotes supported). */
export function parseCsv(text) {
  if (text.startsWith(BOM)) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Rows (first = header) to objects keyed by header name, with the 1-based line number. */
export function csvObjects(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const names = header.map((h) => h.trim());
  return rows.map((r, i) => {
    const o = { _line: i + 2 };
    names.forEach((n, j) => { o[n] = (r[j] ?? '').trim(); });
    return o;
  });
}

function quote(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header, rows) {
  return BOM + [header, ...rows.map((r) => header.map((h) => r[h]))].map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';
}
