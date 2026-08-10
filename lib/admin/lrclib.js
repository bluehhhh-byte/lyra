// lrclib.net 가사 조회 — 곡 추가·품질 재검사가 쓰는 자족 모듈.
//
// iTunes' US store hands back romanized/translated titles ("Through the Night"
// for 밤편지, "Akuro No Oka" for アクロの丘) while lrclib is indexed under the
// native title. Measured hit rate jumped 12/16 → 15/16 by trying the native
// name too. A ±15s duration bound keeps a wrong-length track's lyrics out.
const LRC = "https://lrclib.net/api";
const DUR_BOUND = 15; // seconds
export const hasCJK = (s) => /[぀-ヿ㐀-鿿가-힣]/.test(s || "");

// Per-fetch timeout so one slow/hung lrclib response can't stall the whole
// request (this is what pushed a single song past the serverless limit).
// One retry on a network error or 5xx — a transient blip must not read as "no
// lyrics". A 429 is NOT retried: hammering a rate limit just burns the budget.
async function getJson(url, timeoutMs = 4000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) return await r.json();
      if (r.status < 500) return null; // 404/429 etc. — not worth a retry
    } catch {
      // network error / timeout → retry once
    }
    if (attempt === 0) await new Promise((res) => setTimeout(res, 300));
  }
  return null;
}

const lrcCleanTitle = (t) =>
  (t || "")
    .replace(
      /\s*[\(\[][^)\]]*(remaster|live|acoustic|version|edit|mix|instrumental|deluxe|mono|stereo|feat|with|explicit|bonus)[^)\]]*[\)\]]/gi,
      ""
    )
    .replace(/\s*-\s*(single|ep|remaster(ed)?( \d{4})?|live|radio edit|.*version).*$/i, "")
    .replace(/\s*(feat\.?|ft\.?)\s+.*$/i, "")
    .trim();
const lrcCleanArtist = (a) => (a || "").split(/\s*[,&×]\s*|\s+(?:feat\.?|with|and the)\s+/i)[0].trim();

// Same track id in the JP/KR store often carries the native title/artist.
export async function nativeMeta(trackId, left = () => 8000) {
  if (!trackId) return null;
  for (const country of ["JP", "KR"]) {
    if (left() <= 0) break;
    const j = await getJson(
      `https://itunes.apple.com/lookup?${new URLSearchParams({ id: trackId, country })}`,
      Math.min(4000, left())
    );
    const r = j?.results?.[0];
    if (r && hasCJK(`${r.trackName}${r.artistName}`))
      return { title: r.trackName, artist: r.artistName };
  }
  return null;
}

function nameCandidates(picked, native) {
  const out = [];
  const push = (t, a) => t && a && out.push({ t, a });
  push(picked.title, picked.artist);
  push(lrcCleanTitle(picked.title), lrcCleanArtist(picked.artist));
  if (native) {
    push(native.title, native.artist);
    push(lrcCleanTitle(native.title), lrcCleanArtist(native.artist));
  }
  const seen = new Set();
  return out.filter(({ t, a }) => {
    const k = `${t}|${a}`.toLowerCase();
    return seen.has(k) ? false : seen.add(k);
  });
}

const withinBound = (rowDur, want) => !want || !rowDur || Math.abs(rowDur - want) <= DUR_BOUND;

const asLyric = (text, native) => ({
  lyrics: text,
  lines: text.split("\n").filter((l) => l.trim()).length,
  native,
});

// Returns { lyrics, lines, native } or null. Stops at the first bounded hit, and
// abandons remaining candidates once the time budget is spent — so a slow lrclib
// can't push the request past the serverless timeout. deadlineMs bounds the whole
// lookup (default generous for the add flow; requality passes a tighter one).
export async function findLyrics({ title, artist, album, duration, trackId }, deadlineMs = 20000) {
  const until = Date.now() + deadlineMs;
  const left = () => until - Date.now();
  const native =
    hasCJK(`${title}${artist}`) || left() <= 0 ? null : await nativeMeta(trackId, left);
  // omit falsy fields — URLSearchParams stringifies undefined to the literal
  // "undefined", which corrupts lrclib's exact /get match for pre-change songs.
  const qs = (o) =>
    new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "")).toString();
  for (const { t, a } of nameCandidates({ title, artist }, native)) {
    if (left() <= 0) break; // budget spent — stop rather than risk a timeout
    const g = await getJson(
      `${LRC}/get?${qs({ artist_name: a, track_name: t, album_name: album, duration })}`,
      Math.min(4000, left())
    );
    if (g?.plainLyrics?.trim() && withinBound(g.duration, duration))
      return asLyric(g.plainLyrics.trim(), native);
    if (left() <= 0) break;
    const list =
      (await getJson(`${LRC}/search?${qs({ track_name: t, artist_name: a })}`, Math.min(4000, left()))) ||
      [];
    const best = list
      .filter((r) => r.plainLyrics?.trim())
      .map((r) => ({ r, d: Math.abs((r.duration || 0) - (duration || 0)) }))
      .sort((x, y) => x.d - y.d)
      .find((x) => withinBound(x.r.duration, duration));
    if (best) return asLyric(best.r.plainLyrics.trim(), native);
  }
  return null;
}
