// 음악 취향 집계 — "내가 지금까지 모아온 곡"의 해석. 영화 취향(별점 기반)과
// 달리 별점·재생 기록이 없으므로 모든 표현은 '많이 담은'이지 '좋아하는'이 아니다.
// /songs/taste 페이지 전용. 순수 모듈이라 테스트가 브라우저 없이 돌린다.
import { COUNTRY_TAGS, genreTagOf } from "./genre.js";
import { parseEmotion, emotionValence } from "./keywords.js";

const tally = (values) => {
  const m = new Map();
  for (const v of values) if (v) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

export function summarizeMusicTaste(songs) {
  const count = songs.length;

  const genre = tally(songs.map((s) => genreTagOf(s.tags)));
  const region = tally(songs.map((s) => s.tags.find((t) => COUNTRY_TAGS.includes(t)) || "기타"));
  const decade = tally(songs.filter((s) => s.year).map((s) => `${Math.floor(+s.year / 10) * 10}년대`));
  const emotion = tally(songs.map((s) => parseEmotion(s.emotion)));
  const keywords = tally(songs.flatMap((s) => s.keywords || []));

  // 아티스트 편향 — 반복해서 담은 가수 vs 한 곡만 담긴 발견형
  const artist = tally(songs.map((s) => s.artist));
  const repeat = artist.filter(([, n]) => n >= 2);
  const once = artist.filter(([, n]) => n === 1);

  // 감정 기울기 — 감정 있는 곡들의 valence 평균 (-3 어두움 ~ +3 밝음)
  const moods = songs.map((s) => parseEmotion(s.emotion)).filter(Boolean);
  const valenceMean = moods.length
    ? moods.reduce((sum, e) => sum + emotionValence(e), 0) / moods.length
    : 0;

  // 메타데이터 커버리지 — 각 축이 실제로 몇 곡을 근거로 하는지. "결과가
  // 틀린 것"과 "데이터가 빠진 것"을 구분해 보여주기 위한 숫자.
  const covered = {
    genre: genre.reduce((n, [, c]) => n + c, 0),
    emotion: moods.length,
    decade: decade.reduce((n, [, c]) => n + c, 0),
  };

  return { count, genre, region, decade, emotion, keywords, artist, repeat, once, valenceMean, covered };
}

// 최근 n곡 vs 전체 — "기록이 어떻게 변하고 있는가". getAllSongs는 최신순이라
// 앞에서 n곡을 자른다. 별점 없는 아카이브라 변화 자체가 이야기다.
export function recentShift(songs, n = 10) {
  if (songs.length < n + 5) return null; // 전체가 최근과 비슷하면 비교가 무의미
  const recent = songs.slice(0, n);
  const all = summarizeMusicTaste(songs);
  const r = summarizeMusicTaste(recent);

  // 전체 대비 최근 비중이 어떻게 움직였는지 (%p)
  const share = (rows, key, total) => {
    const hit = rows.find(([k]) => k === key);
    return total ? ((hit?.[1] || 0) / total) * 100 : 0;
  };
  const delta = (rRows, aRows) => {
    const top = rRows[0];
    if (!top) return null;
    return { name: top[0], n: top[1], deltaPct: Math.round(share(rRows, top[0], n) - share(aRows, top[0], songs.length)) };
  };

  const knownArtists = new Set(songs.slice(n).map((s) => s.artist));
  const newArtists = [...new Set(recent.map((s) => s.artist))].filter((a) => !knownArtists.has(a));

  return {
    n,
    genre: delta(r.genre, all.genre),
    emotion: delta(r.emotion, all.emotion),
    region: delta(r.region, all.region),
    valenceRecent: r.valenceMean,
    valenceAll: all.valenceMean,
    newArtists,
  };
}

// 그래프 밑에 붙는 해석 한 문단 — 집계에서 결정적으로 만든다 (Gemini 불필요).
// 데이터가 얇은 축은 문장에서 조용히 빠진다.
export function interpretMusicTaste(t) {
  if (t.count < 5) return "";
  const parts = [];

  const [g1, g2] = t.genre;
  if (g1)
    parts.push(
      g2 && g2[1] >= Math.max(2, g1[1] * 0.6)
        ? `컬렉션은 ${g1[0]}와 ${g2[0]}에 가장 많이 기울어 있다`
        : `컬렉션은 ${g1[0]}에 가장 많이 기울어 있다`
    );

  const d1 = t.decade[0];
  const e1 = t.emotion[0];
  if (d1 && e1) parts.push(`${d1[0]} 곡과 ${e1[0]}의 감정이 자주 등장한다`);
  else if (d1) parts.push(`${d1[0]} 곡이 중심이다`);
  else if (e1) parts.push(`${e1[0]}의 감정이 자주 등장한다`);

  if (t.valenceMean <= -0.8) parts.push("전체적인 정서는 어두운 쪽으로 기운다");
  else if (t.valenceMean >= 0.8) parts.push("전체적인 정서는 밝은 쪽으로 기운다");

  // 발견형 성향 — 한 곡짜리 아티스트가 다수면 새 아티스트를 찾아다니는 수집
  if (t.once.length && t.once.length >= t.artist.length * 0.6)
    parts.push(
      `익숙한 아티스트를 파고들기보다 새로운 아티스트를 한 곡씩 발견하는 경향이 보인다 (${t.artist.length}팀 중 ${t.once.length}팀이 한 곡)`
    );
  // '마음에 든'은 별점 없는 데이터로는 알 수 없는 표현 — 기록된 사실만 말한다
  else if (t.repeat[0] && t.repeat[0][1] >= 3)
    parts.push(`${t.repeat[0][0]}처럼 같은 아티스트의 곡을 반복해서 담는 경향이 보인다`);

  return parts.length ? parts.join(". ") + "." : "";
}
