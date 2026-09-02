import { normText } from "./itunes.js";

export const MUSICBRAINZ_USER_AGENT = "Lyra/1.0 (https://lyracyno.vercel.app)";
let nextMusicBrainzRequestAt = 0;

const clean = (value) => String(value || "").trim();
const artistCredit = (credits) =>
  (Array.isArray(credits) ? credits : [])
    .map((credit) => `${clean(credit?.name || credit?.artist?.name)}${String(credit?.joinphrase || "")}`)
    .join("")
    .trim();

const preferredRelease = (releases) => {
  const rows = Array.isArray(releases) ? releases : [];
  return rows.find((release) => String(release?.status).toLowerCase() === "official") || rows[0] || null;
};

export function musicBrainzToResult(recording = {}) {
  const release = preferredRelease(recording.releases);
  const tags = Array.isArray(recording.tags) ? [...recording.tags] : [];
  tags.sort((left, right) => Number(right?.count || 0) - Number(left?.count || 0));
  const firstDate = clean(recording["first-release-date"] || release?.date);
  const id = clean(recording.id);
  return {
    trackId: "",
    source: "musicbrainz",
    sourceLabel: "MusicBrainz",
    sourceId: id,
    sourceScore: Math.max(0, Math.min(100, Number(recording.score) || 0)),
    title: clean(recording.title),
    artist: artistCredit(recording["artist-credit"]) || "아티스트 미상",
    album: clean(release?.title),
    artwork: "",
    thumb: "",
    duration: Math.round((Number(recording.length) || 0) / 1000) || 0,
    year: /^\d{4}/.test(firstDate) ? firstDate.slice(0, 4) : "",
    genre: clean(tags[0]?.name),
    preview: "",
    external_url: id ? `https://musicbrainz.org/recording/${id}` : "",
  };
}

export async function searchMusicBrainz(query, { limit = 50, offset = 0, fetchImpl = fetch } = {}) {
  const term = clean(query).slice(0, 200);
  if (!term) return { results: [], hasMore: false };
  const url = new URL("https://musicbrainz.org/ws/2/recording/");
  url.search = new URLSearchParams({
    query: term,
    fmt: "json",
    limit: String(Math.max(1, Math.min(100, limit))),
    offset: String(Math.max(0, Number(offset) || 0)),
    dismax: "true",
  });
  try {
    // MusicBrainz는 IP당 평균 초당 1회 요청을 요구한다. 한 인스턴스 안에서
    // 연속 검색이 겹치더라도 최소 1.1초 간격으로 출발시킨다.
    const startAt = Math.max(Date.now(), nextMusicBrainzRequestAt);
    nextMusicBrainzRequestAt = startAt + 1100;
    if (startAt > Date.now()) await new Promise((resolve) => setTimeout(resolve, startAt - Date.now()));
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "User-Agent": MUSICBRAINZ_USER_AGENT },
      signal: AbortSignal.timeout(4500),
      next: { revalidate: 3600 },
    });
    if (!response.ok) return { results: [], hasMore: false };
    const data = await response.json();
    const recordings = Array.isArray(data.recordings) ? data.recordings : [];
    return {
      results: recordings.map(musicBrainzToResult).filter((item) => item.title && item.artist),
      hasMore: Number(data.offset || 0) + recordings.length < Number(data.count || 0),
    };
  } catch {
    return { results: [], hasMore: false };
  }
}

const coverWords = /\bcover\b|karaoke|instrumental|tribute|music box|orgel|オルゴール|カラオケ|原曲|歌ってみた|acapella/i;

export function externalSongScore(result, query) {
  const q = normText(query);
  const title = normText(result.title);
  const artist = normText(result.artist);
  const words = q.split(" ").filter(Boolean);
  let score = 0;

  if (artist === q) score += 520;
  else if (artist.startsWith(q)) score += 260;
  else if (artist.includes(q)) score += 150;
  if (title === q) score += 500;
  else if (title.startsWith(q)) score += 240;
  else if (title.includes(q)) score += 180;

  let hits = 0;
  for (const word of words) {
    const titleHit = title.includes(word);
    const artistHit = artist.includes(word);
    if (titleHit) score += 45;
    if (artistHit) score += 55;
    if (titleHit || artistHit) hits++;
  }
  if (words.length > 1 && hits === words.length) score += 360;
  if (coverWords.test(`${title} ${artist}`)) score -= 300;

  // MusicBrainz의 Lucene 점수는 별칭으로 찾은 결과도 살려 준다. 다만 제목·가수
  // 자체가 맞는 Apple 결과보다 무조건 앞서지 않도록 상한을 둔다.
  if (result.source === "musicbrainz") score += Math.min(180, Number(result.sourceScore || 0) * 1.8);
  else score += 20; // 같은 곡이면 커버·미리듣기가 있는 Apple 결과를 먼저 쓴다.
  const year = Number(result.year) || 0;
  if (year) score += Math.min(3, Math.max(0, (year - 2000) / 9));
  return score;
}

export const externalSongIdentity = (result) =>
  `${normText(result?.title)}|${normText(result?.artist)}`;

const richness = (result) =>
  (result.source === "apple" ? 100 : 0) +
  (result.artwork ? 20 : 0) +
  (result.preview ? 10 : 0) +
  (result.album ? 4 : 0) +
  (result.year ? 2 : 0);

export function credibleExternalSong(result, query) {
  if (result?.source !== "musicbrainz") return true;
  if (Number(result.sourceScore || 0) >= 60) return true;
  const haystack = `${normText(result.title)} ${normText(result.artist)}`;
  const words = normText(query).split(" ").filter((word) => word.length > 1);
  return words.length > 0 && words.every((word) => haystack.includes(word));
}

export function mergeExternalSongResults(groups, query) {
  const byIdentity = new Map();
  for (const result of groups.flat()) {
    if (!result?.title || !result?.artist || !credibleExternalSong(result, query)) continue;
    const identity = externalSongIdentity(result);
    const previous = byIdentity.get(identity);
    if (!previous || richness(result) > richness(previous)) byIdentity.set(identity, result);
  }
  return [...byIdentity.values()].sort((left, right) =>
    externalSongScore(right, query) - externalSongScore(left, query)
  );
}
