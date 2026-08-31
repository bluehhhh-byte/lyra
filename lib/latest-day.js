// 기록 날짜별 음악과 영화를 분석한다.
//
// 현재 songs·movies를 KST 날짜별로 묶어 모든 날의 리포트를 만든다. 저장된 JSON도,
// 생성 버튼도, AI 호출도 없다 — 원본 기록이 곧 이력이라 과거 날짜도 사라지지 않는다.
// 같은 데이터에서는 언제나 같은 문장이 나온다.
//
// 문장의 주어는 '이날의 기록'이다. 사람을 판정하지 않고 임상 용어를 쓰지 않는다.
// 영화는 감정 태그가 없으므로(주제 어휘만 있다) 감정 좌표 계산에 넣지 않는다.
import { parseEmotion } from "./keywords.js";
import { emotionCenter, emotionEntropy, diversityLabel, MOOD_MIN_SAMPLE } from "./emotion-model.js";
import { kstDay } from "./kst.js";

const tally = (values) => {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

const recordedAt = (item) => item.published || item.date || "";
const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();
const clip = (value, max = 72) => {
  const text = cleanText(value);
  return text.length <= max ? text : `${text.slice(0, max).trim()}…`;
};

// 가사를 통계 키워드로만 환원하지 않고 실제 장면을 남긴다. 번역문을 우선하고,
// 한국어 원곡은 원문을 쓴다. 같은 후렴은 한 번만 담고 곡마다 최대 두 줄만 쓴다.
function lyricEvidence(song) {
  const seen = new Set();
  const lines = [];
  for (const stanza of song.stanzas || []) {
    for (const line of stanza.lines || []) {
      const translated = cleanText(line.ko);
      const original = cleanText(line.en);
      const text = translated || (/[가-힣]/.test(original) ? original : "");
      if (text.length < 5 || seen.has(text)) continue;
      seen.add(text);
      const keywordHits = (song.keywords || []).filter((keyword) => text.includes(keyword)).length;
      lines.push({ text: clip(text, 52), score: keywordHits, index: lines.length });
    }
  }
  return lines.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).map((line) => line.text);
}

// 그날 기록 중 가장 최근에 올린 것 — 같은 날 안에서는 시각으로 가른다
const newest = (items) => items.reduce((best, item) => (!best || item.at > best.at ? item : best), null);

const normalizeEntries = (songs, movies) => [
    ...songs.map((s) => ({
      kind: "music",
      slug: s.slug,
      title: s.title,
      subtitle: s.artist,
      emotion: parseEmotion(s.emotion),
      genre: cleanText(s.genre),
      keywords: s.keywords || [],
      comment: (s.comment || "").trim(),
      lyricEvidence: lyricEvidence(s),
      at: recordedAt(s),
    })),
    ...movies.map((m) => ({
      kind: "movie",
      slug: m.slug,
      title: m.title_ko || m.title,
      subtitle: m.director_ko || m.director || "",
      themes: m.themes || [],
      rating: typeof m.rating === "number" ? m.rating : null,
      comment: (m.comment || "").trim(),
      at: recordedAt(m),
    })),
  ].filter((e) => e.at);

function insightForDay(day, items) {
  const music = items.filter((e) => e.kind === "music");
  const film = items.filter((e) => e.kind === "movie");
  const emotions = tally(music.map((e) => e.emotion));
  const center = emotionCenter(music.map((e) => e.emotion));
  const entropy = emotionEntropy(emotions);
  const keywords = tally(music.flatMap((e) => e.keywords));
  const themes = tally(film.flatMap((e) => e.themes));

  // 대표 곡: dominant 감정의 곡 중 가장 최근. 대표 영화: 별점이 가장 높은 것(동률이면 최근).
  // 둘 다 그날 items에서만 고르므로 없는 작품이 나올 수 없다.
  const dominant = emotions[0]?.[0] || "";
  const domMusic = dominant ? music.filter((e) => e.emotion === dominant) : [];
  const repSong = newest(domMusic.length ? domMusic : music);
  const repMovie = film.length
    ? film.reduce((best, m) => {
        const r = (x) => (x.rating ?? -1);
        return !best || r(m) > r(best) || (r(m) === r(best) && m.at > best.at) ? m : best;
      }, null)
    : null;

  return {
    day,
    music: music.length,
    movies: film.length,
    emotions,
    dominant,
    center,
    entropy,
    diversity: emotions.length ? diversityLabel(emotions) : "",
    sparse: !center || center.n < MOOD_MIN_SAMPLE,
    keywords,
    themes,
    repSong,
    repMovie,
    text: narrate({ music, film, emotions, dominant, center, entropy, keywords, themes, repSong, repMovie }),
  };
}

export function latestRecordedDay(songs = [], movies = []) {
  return [...songs, ...movies].map(recordedAt).map(kstDay).filter(Boolean).sort().at(-1) || "";
}

// 오래된 날부터 최신 날까지 한 번만 순회해 리포트를 만든다. 아카이브가 날짜마다
// 전체 곡을 다시 거르는 O(날짜×기록) 비용을 내지 않게 날짜별 Map을 먼저 만든다.
export function dayInsights(songs = [], movies = []) {
  const byDay = new Map();
  for (const entry of normalizeEntries(songs, movies)) {
    const day = kstDay(entry.at);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(entry);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, items]) => insightForDay(day, items));
}

export function latestDayInsight(songs = [], movies = []) {
  return dayInsights(songs, movies).at(-1) || null;
}

export const workLabel = (item) =>
  !item ? "" : item.kind === "movie" ? `${item.title} — ${item.subtitle || "감독 미상"}` : `${item.subtitle} — ${item.title}`;

function narrate({ music, film, dominant, keywords, themes, repMovie }) {
  const genres = tally(music.map((item) => item.genre)).slice(0, 2).map(([genre]) => genre);
  const lyrics = music.flatMap((item) => item.lyricEvidence.slice(0, 1)).slice(0, 2);
  const words = keywords.slice(0, 2).map(([word]) => word);
  const filmThemes = themes.slice(0, 2).map(([theme]) => theme);

  // 리포트가 아니라 짧은 평론으로 쓴다. 수치·표본·좌표는 시각화 데이터에만 남기고,
  // 본문은 실제 가사와 장르가 만드는 인상만 두 문장 안에 담는다.
  if (music.length) {
    const texture = genres.length ? `${genres.join("·")}의 질감 위에서` : "절제된 소리 위에서";
    const lyricPart = lyrics.length === 1
      ? `“${lyrics[0]}”라는 구절이`
      : lyrics.length > 1
        ? `${lyrics.map((line) => `“${line}”`).join("와 ")}는`
        : `${words.length ? `${words.map((word) => `‘${word}’`).join("과 ")} 같은 말들` : "짧은 말들"}은`;
    const mood = dominant ? `${dominant}을 직접 설명하지 않고` : "감정을 섣불리 설명하지 않고";
    const filmTail = filmThemes.length ? ` ${filmThemes.join("·")}의 영화도 같은 여운을 건넨다.` : "";
    return `${texture} ${lyricPart} 마음이 머문 자리를 조용히 드러낸다. ${mood} 리듬과 여백 사이에 오래 남기는 음악이다.${filmTail}`;
  }

  if (film.length) {
    const title = workLabel(repMovie);
    const subject = filmThemes.length ? filmThemes.join("·") : "말로 다 닿지 않는 장면";
    return `${title}은 ${subject}을 화면의 여백에 남긴다. 이야기가 끝난 뒤에도 장면의 온도는 쉽게 식지 않는다.`;
  }
  return "이날의 기록은 짧은 여운만 남긴다.";
}
