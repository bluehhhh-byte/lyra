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

export function findDuplicateSongGroups(songs) {
  const buckets = [];
  const byTrack = new Map();
  const byIdentity = new Map();
  for (const song of songs || []) {
    const trackId = String(song?.trackId || "").trim();
    const identity = `${normalized(song?.artist)}|${normalized(song?.title)}`;
    if (trackId) (byTrack.get(trackId) || byTrack.set(trackId, []).get(trackId)).push(song);
    if (identity !== "|") (byIdentity.get(identity) || byIdentity.set(identity, []).get(identity)).push(song);
  }
  for (const [reason, groups] of [["trackId", byTrack], ["artist-title", byIdentity]]) {
    for (const members of groups.values()) if (members.length > 1) buckets.push({ reason, members });
  }
  const seen = new Set();
  return buckets
    .map(({ reason, members }) => {
      const signature = members.map((song) => String(song.slug || "")).sort().join("|");
      if (seen.has(signature)) return null;
      seen.add(signature);
      return {
        reason,
        songs: members.map((song) => ({
          slug: String(song.slug || ""), title: String(song.title || ""), artist: String(song.artist || ""),
          date: String(song.date || ""), trackId: String(song.trackId || ""),
        })).sort((a, b) => a.slug.localeCompare(b.slug)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.songs[0].artist.localeCompare(b.songs[0].artist));
}
