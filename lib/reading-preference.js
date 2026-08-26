export const hasReadings = (stanzas) => stanzas.some((stanza) => stanza.lines.some((line) => Boolean(String(line.reading || "").trim())));

export function savedReadingVisibility(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

const READING_SIZES = new Set(["s", "m", "l"]);

export function savedReadingSize(value, fallback = "m") {
  return READING_SIZES.has(value) ? value : fallback;
}
