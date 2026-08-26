export const TRANSLATION_PAGE_SIZE = 300;

export function translationLines(songs) {
  return songs.flatMap((song) => song.stanzas.flatMap((stanza, stanzaIndex) =>
    stanza.lines
      .filter((line) => String(line.ko || "").trim())
      .map((line, lineIndex) => ({
        key: `${song.slug}:${stanzaIndex}:${lineIndex}`,
        slug: song.slug,
        title: song.title,
        artist: song.artist,
        stanzaIndex,
        text: String(line.ko).trim(),
      }))
  ));
}

export function translationPage(songs, page, pageSize = TRANSLATION_PAGE_SIZE) {
  const lines = translationLines(songs);
  const totalPages = Math.max(1, Math.ceil(lines.length / pageSize));
  const current = Number(page);
  if (!Number.isInteger(current) || current < 1 || current > totalPages) return null;
  return {
    page: current,
    pageSize,
    totalLines: lines.length,
    totalPages,
    lines: lines.slice((current - 1) * pageSize, current * pageSize),
  };
}
