const normalized = (value) => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase()
  .replace(/[\p{P}\p{S}\s]+/gu, "")
  .trim();

export function findDuplicateSong(candidate, songs, { excludeSlug = "" } = {}) {
  const trackId = String(candidate?.trackId || "").trim();
  const title = normalized(candidate?.title);
  const artist = normalized(candidate?.artist);
  if (!title || !artist) return null;

  const pool = (songs || []).filter((song) => song?.slug !== excludeSlug);
  const byTrack = trackId && pool.find((song) => String(song.trackId || "").trim() === trackId);
  const match = byTrack || pool.find((song) =>
    normalized(song.title) === title && normalized(song.artist) === artist
  );
  if (!match) return null;
  return {
    slug: String(match.slug || ""),
    title: String(match.title || ""),
    artist: String(match.artist || ""),
    reason: byTrack ? "trackId" : "artist-title",
  };
}
