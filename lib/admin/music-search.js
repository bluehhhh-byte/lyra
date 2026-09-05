import { normText } from "./itunes.js";

const clean = (value) => String(value || "").trim();
const editionWords = /(?:\s*[-–—:]?\s*[([](?:remaster(?:ed)?|live|acoustic|instrumental|karaoke|radio edit|single edit|mono|stereo|version|ver\.?|mix)[^\])]*[\])])$/i;
const regexEscape = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CURATED_SEARCH_ALIASES = [
  ["요네즈 켄시", "米津玄師"],
  ["켄시 요네즈", "米津玄師"],
  ["Kenshi Yonezu", "米津玄師"],
  ["지구본", "地球儀"],
  ["0번째 감각", "第ゼロ感"],
  ["제로감", "第ゼロ感"],
  ["망각의 하늘", "忘却の空"],
  ["아무것도 없어", "なんもねえ"],
  ["와스레란네에요", "忘れらんねえよ"],
  ["세계가 끝났어", "世界が終わりました"],
  ["The World Has Ended", "世界が終わりました"],
  ["유우리", "優里"],
  ["Yuuri", "優里"],
];

export const stripSongEdition = (value) => clean(value).replace(editionWords, "").trim();

// 이미 검수해 등록한 곡의 번역 제목·한글 아티스트명을 새 곡 검색에도 활용한다.
// 별도 번역 API 호출 없이 개인 라이브러리가 커질수록 검색 사전도 함께 좋아진다.
export function buildSearchQueries(query, knownSongs = []) {
  const original = clean(query).replace(/\s+/g, " ").slice(0, 200);
  if (!original) return [];
  const pairs = [...CURATED_SEARCH_ALIASES];
  for (const song of knownSongs) {
    for (const [alias, native] of [
      [song?.titleKo || song?.title_ko, song?.title],
      [song?.artistKo || song?.artist_ko, song?.artist],
    ]) {
      const left = clean(alias);
      const right = clean(native);
      if (left.length >= 2 && right && normText(left) !== normText(right)) pairs.push([left, right]);
    }
  }
  pairs.sort((left, right) => right[0].length - left[0].length);
  let expanded = original;
  for (const [alias, native] of pairs) {
    const pattern = regexEscape(alias).replace(/\\\s+/g, "\\s+");
    expanded = expanded.replace(new RegExp(pattern, "giu"), native);
  }
  const stripped = stripSongEdition(expanded);
  return [...new Set([original, expanded, stripped].map((value) => clean(value).replace(/\s+/g, " ")).filter(Boolean))].slice(0, 3);
}
const coverWords = /\bcover\b|karaoke|instrumental|tribute|music box|orgel|remix|mashup|オルゴール|カラオケ|原曲歌手|歌ってみた|acapella/i;

export function externalSongScore(result, query) {
  const q = normText(query);
  const title = normText(result.title);
  const artist = normText(result.artist);
  const aliases = (result.aliases || []).map(normText).filter(Boolean);
  const words = q.split(" ").filter(Boolean);
  let score = 0;

  if (artist === q) score += 520;
  else if (artist.startsWith(q)) score += 260;
  else if (artist.includes(q)) score += 150;
  if (title === q) score += 500;
  else if (title.startsWith(q)) score += 240;
  else if (title.includes(q)) score += 180;
  // "곡명 + 아티스트" 검색에서는 전체 query가 제목과 같을 수 없다. 반대로
  // 장식 없는 제목·아티스트가 query 안에 온전히 들어가면 원곡의 강한 신호다.
  if (title.length >= 2 && q.includes(title)) score += 280;
  if (artist.length >= 2 && q.includes(artist)) score += 300;

  let hits = 0;
  for (const word of words) {
    const titleHit = title.includes(word);
    const artistHit = artist.includes(word);
    if (titleHit) score += 45;
    if (artistHit) score += 55;
    if (titleHit || artistHit) hits++;
  }
  if (words.length > 1 && hits === words.length) score += 360;
  if (aliases.some((alias) => alias === q)) score += 480;
  else if (aliases.some((alias) => alias.includes(q) || q.includes(alias))) score += 160;
  if (coverWords.test(`${title} ${artist}`) && !coverWords.test(q)) score -= 300;
  if (editionWords.test(clean(result.title)) && !editionWords.test(clean(query))) score -= 35;

  const year = Number(result.year) || 0;
  if (year) score += Math.min(3, Math.max(0, (year - 2000) / 9));
  return score;
}

export const externalSongIdentity = (result) =>
  `${normText(result?.title)}|${normText(result?.artist)}`;

const richness = (result) =>
  (result.artwork ? 20 : 0) +
  (result.preview ? 10 : 0) +
  (result.album ? 4 : 0) +
  (result.year ? 2 : 0);

// 검색원이 Apple 하나뿐이라 걸러낼 것이 없다. 호출부(mergeExternalSongResults)를
// 그대로 두기 위해 자리만 남긴다 — 검색원이 다시 늘면 여기에 판정을 넣는다.
export function credibleExternalSong() {
  return true;
}

export function mergeExternalSongResults(groups, query) {
  const queries = (Array.isArray(query) ? query : [query]).filter(Boolean);
  const byIdentity = new Map();
  for (const result of groups.flat()) {
    if (!result?.title || !result?.artist || !queries.some((value) => credibleExternalSong(result, value))) continue;
    const identity = externalSongIdentity(result);
    const previous = byIdentity.get(identity);
    if (!previous || richness(result) > richness(previous)) byIdentity.set(identity, result);
  }
  const bestScore = (result) => Math.max(...queries.map((value) => externalSongScore(result, value)));
  return [...byIdentity.values()].sort((left, right) => bestScore(right) - bestScore(left));
}

export function searchQualityMetrics(cases, resultsByQuery) {
  const rows = cases.map((item) => {
    const results = resultsByQuery[item.query] || [];
    const expectedTitles = (item.expectedTitles || [item.expectedTitle]).map(normText);
    const expectedArtists = (item.expectedArtists || [item.expectedArtist]).map(normText);
    const rank = results.findIndex((result) =>
      expectedTitles.some((title) => {
        const actual = normText(stripSongEdition(result.title));
        return actual === title || actual.startsWith(`${title} `);
      }) &&
      expectedArtists.some((artist) => normText(result.artist).includes(artist))
    ) + 1;
    return { query: item.query, rank, resultCount: results.length };
  });
  const total = rows.length || 1;
  return {
    total: rows.length,
    top1: rows.filter((row) => row.rank === 1).length,
    top5: rows.filter((row) => row.rank > 0 && row.rank <= 5).length,
    zeroResult: rows.filter((row) => row.resultCount === 0).length,
    top1Rate: rows.filter((row) => row.rank === 1).length / total,
    top5Rate: rows.filter((row) => row.rank > 0 && row.rank <= 5).length / total,
    rows,
  };
}
