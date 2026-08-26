export function highlightSegments(value, rawQuery) {
  const text = String(value || "");
  const query = String(rawQuery || "").trim();
  if (!query) return [{ text, match: false }];
  const source = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const parts = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = source.indexOf(needle, cursor);
    if (index < 0) break;
    if (index > cursor) parts.push({ text: text.slice(cursor, index), match: false });
    parts.push({ text: text.slice(index, index + query.length), match: true });
    cursor = index + query.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts.length ? parts : [{ text, match: false }];
}
