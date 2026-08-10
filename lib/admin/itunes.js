// iTunes 검색 보강 — 곡 추가 검색(search 액션) 전용.

// Shared text normalizer (decoration-insensitive) for matching names/titles.
export const normText = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’'ʻ´`"]/g, "")
    .replace(/[()\[\]\-_.,!?~×&/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Pull an artist's full catalog by lookup — reaches 19금/explicit tracks that
// Apple drops from /search but keeps in the catalog. Resolve the artist id(s)
// (dropping trailing title words until one resolves), then look them up. Bounded
// (≤3 artists) and parallel so it can run inline on every search cheaply.
export async function fetchArtistCatalog(query) {
  const words = (query || "").trim().split(/\s+/).filter(Boolean);
  // the artist is the leading OR trailing tokens (users type both "가수 곡" and
  // "곡 가수") — try the full query, the first two, and the last two words. All
  // resolutions run in parallel (one round trip), not a sequential trim loop.
  const terms = [...new Set([words.join(" "), words.slice(0, 2).join(" "), words.slice(-2).join(" ")])].filter(Boolean);
  const artists = new Map(); // id -> name
  await Promise.all(
    terms.flatMap((term) =>
      ["KR", "US"].map((c) =>
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=musicArtist&limit=3&country=${c}`)
          .then((r) => r.json())
          .then((r) => (r.results || []).forEach((a) => a.artistId && artists.set(a.artistId, a.artistName || "")))
          .catch(() => {})
      )
    )
  );
  if (!artists.size) return [];
  // iTunes' musicArtist search is loose ("master muzik" also returns i-dle,
  // NewJeans) — keep only artists whose name actually appears in the query, so
  // an artist-only search doesn't drag in unrelated discographies.
  const nq = normText(query);
  let ids = [...artists.entries()].filter(([, name]) => name && nq.includes(normText(name))).map(([id]) => id);
  if (!ids.length) ids = [...artists.keys()].slice(0, 1); // no clean match → best single guess
  const lists = await Promise.all(
    ids.slice(0, 3).map((id) =>
      fetch(`https://itunes.apple.com/lookup?id=${id}&entity=song&limit=200&country=KR`)
        .then((r) => r.json())
        .then((j) => (j.results || []).filter((r) => r.wrapperType === "track"))
        .catch(() => [])
    )
  );
  return lists.flat();
}

// resolve to [] if a best-effort task overruns — used so the artist-catalog
// augmentation can never stall the main search
export const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((r) => setTimeout(() => r([]), ms))]);

// Shape an iTunes track (from /search or /lookup) into the picker's result form.
export function itunesToResult(r) {
  const art = r.artworkUrl100 || ""; // some tracks/regions omit artwork
  return {
    trackId: r.trackId, // lets the lyrics step re-query the JP/KR store for native names
    title: r.trackName,
    artist: r.artistName,
    album: r.collectionName,
    artwork: art.replace("100x100", "600x600"),
    thumb: art,
    duration: Math.round((r.trackTimeMillis || 0) / 1000),
    year: (r.releaseDate || "").slice(0, 4),
    genre: r.primaryGenreName || "",
    preview: r.previewUrl || "",
  };
}
