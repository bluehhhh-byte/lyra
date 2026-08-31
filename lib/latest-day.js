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
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
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

function narrate({ music, film, emotions, dominant, center, entropy, keywords, themes, repSong, repMovie }) {
  const s = [];
  const mix = [music.length && `음악 ${music.length}곡`, film.length && `영화 ${film.length}편`].filter(Boolean).join("과 ");
  const reps = [workLabel(repSong), workLabel(repMovie)].filter(Boolean);
  const kw = keywords.slice(0, 2).map(([k]) => k);
  const th = themes.slice(0, 2).map(([t]) => t);
  const lyricScenes = music.flatMap((item) => item.lyricEvidence.slice(0, 1)).slice(0, 3);
  const explanations = [...music, ...film]
    .filter((item) => item.comment)
    .slice(0, 2)
    .map((item) => ({ label: item.title, text: clip(item.comment.split(/(?<=[.!?。！？])\s+/)[0], 78) }));
  const addSources = () => {
    if (lyricScenes.length)
      s.push(`가사에는 ${lyricScenes.map((line) => `“${line}”`).join(", ")} 같은 표현과 장면이 남아 이 정서를 구체화한다.`);
    else if (kw.length)
      s.push(`가사에서는 ${kw.map((k) => `'${k}'`).join("과 ")}이 되풀이된다.`);
    if (explanations.length)
      s.push(`설명글에서는 ${explanations.map(({ label, text }) => `${label}: “${text}”`).join(", 그리고 ")}라고 읽는다.`);
    if (th.length) s.push(`같은 날의 영화는 ${th.join("·")}의 이야기로 이어진다.`);
  };

  // 감정 태그가 하나도 없으면 억지로 좌표를 말하지 않고 작품과 키워드로 설명한다
  if (!emotions.length) {
    s.push(`${mix}이 남았다.`);
    addSources();
    if (reps.length) s.push(`이날의 기록은 ${reps.join(", 그리고 ")}이다.`);
    return s.join(" ");
  }

  const level = (n) => (n >= 1.2 ? "높은" : n <= -1.2 ? "낮은" : "중간쯤의");
  const tone = center.v >= 1.2 ? "밝은" : center.v <= -1.2 ? "어두운" : "중립에 가까운";

  // 감정이 붙은 곡이 적으면 그날 전체로 확대하지 않는다
  if (center.n < MOOD_MIN_SAMPLE) {
    const only = center.n === 1 ? "한 곡" : `${center.n}곡`;
    s.push(`${mix}이 남았고, 감정이 붙은 건 ${only}이다.`);
    s.push(`감정 태그는 ${dominant}을 가리키고, 밝기 ${fmt1(center.v)} · 각성 ${fmt1(center.a)}의 ${level(center.a)} 각성·${tone} 위치에 놓인다. 표본이 적어 하루의 흐름을 말하기는 어렵다. 하루 전체보다 이 기록의 정서로 읽는다.`);
    addSources();
    if (reps.length) s.push(`이날의 기록은 ${reps.join(", 그리고 ")}이다.`);
    return s.join(" ");
  }

  const others = emotions.slice(1, 3).map(([e]) => e);
  const spreadPart =
    entropy >= 0.75
      ? `${dominant}을 중심으로 ${others.join("·")}도 함께 나타나 한쪽으로만 기울지는 않았다`
      : emotions.length > 1
        ? `${dominant}이 앞서고 ${others.join("·")}이 뒤를 이으며 ${diversityLabel(emotions)} 양상이다`
        : `${dominant} 하나에 기록이 모였다`;
  s.push(`${mix}이 남았고, 감정은 ${spreadPart}.`);
  s.push(`정서 좌표는 밝기 ${fmt1(center.v)} · 각성 ${fmt1(center.a)}다. 이는 ${level(center.a)} 각성과 ${tone} 위치를 뜻한다.`);
  addSources();
  if (reps.length) s.push(`이 흐름은 ${reps.join(", 그리고 ")}에서 가장 선명하게 드러난다.`);
  return s.join(" ");
}
