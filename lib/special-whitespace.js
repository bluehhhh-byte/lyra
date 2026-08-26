const SPECIAL_SPACES = new Map([
  [0x00a0, "NO-BREAK SPACE"],
  [0x1680, "OGHAM SPACE MARK"],
  [0x2000, "EN QUAD"], [0x2001, "EM QUAD"], [0x2002, "EN SPACE"],
  [0x2003, "EM SPACE"], [0x2004, "THREE-PER-EM SPACE"], [0x2005, "FOUR-PER-EM SPACE"],
  [0x2006, "SIX-PER-EM SPACE"], [0x2007, "FIGURE SPACE"], [0x2008, "PUNCTUATION SPACE"],
  [0x2009, "THIN SPACE"], [0x200a, "HAIR SPACE"], [0x202f, "NARROW NO-BREAK SPACE"],
  [0x205f, "MEDIUM MATHEMATICAL SPACE"], [0x3000, "IDEOGRAPHIC SPACE"], [0xfeff, "BOM"],
]);

export function specialWhitespaceAt(text) {
  const hits = [];
  String(text).split(/\r?\n/).forEach((line, lineIndex) => {
    [...line].forEach((character, columnIndex) => {
      const point = character.codePointAt(0);
      if (SPECIAL_SPACES.has(point)) {
        hits.push({
          line: lineIndex + 1,
          column: columnIndex + 1,
          code: `U+${point.toString(16).toUpperCase().padStart(4, "0")}`,
          name: SPECIAL_SPACES.get(point),
        });
      }
    });
  });
  return hits;
}

export function summarizeSpecialWhitespace(hits, limit = 12) {
  const shown = hits.slice(0, limit).map((hit) => `${hit.line}:${hit.column} ${hit.code}`);
  return `${hits.length}곳 — ${shown.join(", ")}${hits.length > limit ? ` 외 ${hits.length - limit}곳` : ""}`;
}
