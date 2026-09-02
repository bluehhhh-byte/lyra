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

export async function searchItunesStorePage(query, country, { limit = 50, offset = 0, fetchImpl = fetch } = {}) {
  const pageSize = Math.max(1, Math.min(50, Number(limit) || 50));
  const pageOffset = Math.max(0, Math.min(199, Number(offset) || 0));
  // iTunes Search 문서는 limit(최대 200)은 보장하지만 offset은 보장하지 않는다.
  // 다음 페이지는 결과 범위를 늘려 다시 받은 뒤 필요한 구간만 잘라 안정적으로 만든다.
  const requestedLimit = Math.min(200, pageOffset + pageSize);
  const params = new URLSearchParams({
    term: String(query || "").trim().slice(0, 200),
    entity: "song",
    limit: String(requestedLimit),
    country,
    explicit: "Yes",
    ...(country === "JP" ? { lang: "ja_jp" } : {}),
  });
  try {
    const response = await fetchImpl(`https://itunes.apple.com/search?${params}`, {
      signal: AbortSignal.timeout(4500),
      // Apple은 호출량을 약 분당 20회로 제한한다. 같은 검색을 다시 눌렀을 때
      // 스토어 세 곳을 재호출하지 않도록 짧게 캐시한다.
      next: { revalidate: 900 },
    });
    if (!response.ok) return { results: [], ok: false, error: `HTTP ${response.status}`, hasMore: true, nextOffset: pageOffset };
    const data = await response.json();
    const all = Array.isArray(data.results) ? data.results : [];
    const results = all.slice(pageOffset, pageOffset + pageSize);
    const hasMore = pageOffset + pageSize < 200 && all.length === requestedLimit;
    return { results, ok: true, error: "", hasMore, nextOffset: hasMore ? pageOffset + pageSize : null };
  } catch (error) {
    return { results: [], ok: false, error: error?.name === "TimeoutError" ? "시간 초과" : "연결 실패", hasMore: true, nextOffset: pageOffset };
  }
}

export async function searchItunesStore(query, country, options = {}) {
  return (await searchItunesStorePage(query, country, options)).results;
}

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
    source: "apple",
    sourceLabel: "Apple Music",
    sourceId: String(r.trackId || ""),
    sourceScore: 0,
    aliases: [r.trackCensoredName].filter((name) => name && name !== r.trackName),
    title: r.trackName,
    artist: r.artistName,
    album: r.collectionName,
    artwork: art.replace("100x100", "600x600"),
    thumb: art,
    duration: Math.round((r.trackTimeMillis || 0) / 1000),
    year: (r.releaseDate || "").slice(0, 4),
    genre: r.primaryGenreName || "",
    preview: r.previewUrl || "",
    external_url: r.trackViewUrl || "",
  };
}
