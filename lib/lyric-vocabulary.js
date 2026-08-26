const wordsOf = (text) => String(text || "").normalize("NFKC").toLocaleLowerCase("ko-KR").match(/[가-힣]{2,}/g) || [];

export function lyricVocabulary(songs, { limit = 30 } = {}) {
  const vocabulary = new Map();
  for (const song of songs || []) {
    const songCounts = new Map();
    for (const line of song.stanzas?.flatMap((stanza) => stanza.lines) || []) {
      for (const word of wordsOf(line.ko)) songCounts.set(word, (songCounts.get(word) || 0) + 1);
    }
    for (const [word, count] of songCounts) {
      const row = vocabulary.get(word) || { word, count: 0, songs: [], years: new Map() };
      row.count += count;
      row.songs.push({ slug: song.slug, title: song.title, artist: song.artist, year: song.year || "", count });
      const year = /^\d{4}$/.test(String(song.year || "")) ? String(song.year) : "연도 미상";
      row.years.set(year, (row.years.get(year) || 0) + count);
      vocabulary.set(word, row);
    }
  }
  return [...vocabulary.values()]
    .map((row) => ({
      word: row.word,
      count: row.count,
      songCount: row.songs.length,
      songs: row.songs.sort((a, b) => b.count - a.count
        || a.title.localeCompare(b.title, "ko")
        || a.artist.localeCompare(b.artist, "ko")
        || a.slug.localeCompare(b.slug)),
      years: [...row.years].map(([year, count]) => ({ year, count })).sort((a, b) => b.count - a.count || a.year.localeCompare(b.year)),
    }))
    .sort((a, b) => b.count - a.count || b.songCount - a.songCount || a.word.localeCompare(b.word, "ko"))
    .slice(0, limit);
}
