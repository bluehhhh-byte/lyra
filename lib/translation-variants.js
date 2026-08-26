// 같은 원문이 한 곡 안에서 서로 다른 번역으로 반복되는지 판정하는 한 곳.
// 의도한 문맥 변주일 수 있으므로 결과는 알림과 린트에만 쓰고 자동 수정하지 않는다.
export function translationVariants(lines) {
  const byOriginal = new Map();
  for (const line of lines || []) {
    const original = line.en?.trim();
    const translation = line.ko?.trim();
    if (!original || !translation) continue;
    if (!byOriginal.has(original)) byOriginal.set(original, new Set());
    byOriginal.get(original).add(translation);
  }

  return [...byOriginal]
    .filter(([, translations]) => translations.size > 1)
    .map(([original, translations]) => ({ original, translations: [...translations] }));
}

export function artistTranslationVariants(songs) {
  const artists = new Map();
  for (const song of songs || []) {
    const artist = String(song.artist_ko || song.artist || "").trim();
    if (!artist || !song.slug) continue;
    if (!artists.has(artist)) artists.set(artist, new Map());
    const originals = artists.get(artist);
    for (const line of song.stanzas?.flatMap((stanza) => stanza.lines) || []) {
      const original = String(line.en || "").normalize("NFKC").trim();
      const translation = String(line.ko || "").normalize("NFKC").trim();
      if (!original || !translation) continue;
      const key = original.toLocaleLowerCase();
      if (!originals.has(key)) originals.set(key, { original, variants: new Map() });
      const row = originals.get(key);
      if (!row.variants.has(translation)) row.variants.set(translation, new Map());
      row.variants.get(translation).set(song.slug, { slug: song.slug, title: song.title });
    }
  }

  const result = [];
  for (const [artist, originals] of artists) {
    for (const { original, variants } of originals.values()) {
      const songSlugs = new Set([...variants.values()].flatMap((songsBySlug) => [...songsBySlug.keys()]));
      if (variants.size < 2 || songSlugs.size < 2) continue;
      result.push({
        artist,
        original,
        variants: [...variants].map(([translation, songsBySlug]) => ({ translation, songs: [...songsBySlug.values()] })),
        songCount: songSlugs.size,
      });
    }
  }
  return result.sort((a, b) => b.songCount - a.songCount || a.artist.localeCompare(b.artist, "ko") || a.original.localeCompare(b.original));
}
