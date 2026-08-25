export function normalizeSongSearch(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function filterAdminSongs(songs, query) {
  const terms = normalizeSongSearch(query).split(" ").filter(Boolean);
  if (!terms.length) return songs;

  return songs.filter((song) => {
    const haystack = normalizeSongSearch(`${song.title || ""} ${song.artist || ""}`);
    return terms.every((term) => haystack.includes(term));
  });
}
