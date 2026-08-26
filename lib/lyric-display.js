const stanzaKey = (stanza) => stanza.lines
  .map((line) => String(line.en || "").normalize("NFKC").trim().toLocaleLowerCase())
  .filter(Boolean)
  .join("\n");

export function repeatedStanzaDisplay(stanzas, { minimum = 3 } = {}) {
  const totals = new Map();
  for (const stanza of stanzas) {
    const key = stanzaKey(stanza);
    if (key) totals.set(key, (totals.get(key) || 0) + 1);
  }
  const seen = new Map();
  return stanzas.map((stanza) => {
    const key = stanzaKey(stanza);
    const occurrence = (seen.get(key) || 0) + 1;
    if (key) seen.set(key, occurrence);
    const repeatCount = totals.get(key) || 1;
    return {
      stanza,
      repeatCount,
      occurrence,
      collapsed: Boolean(key && repeatCount >= minimum && occurrence > 1),
    };
  });
}
