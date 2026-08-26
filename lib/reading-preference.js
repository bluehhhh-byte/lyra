export const hasReadings = (stanzas) => stanzas.some((stanza) => stanza.lines.some((line) => Boolean(String(line.reading || "").trim())));

export function savedReadingVisibility(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}
