// 아카이브의 월별·연간 정서 통계 — 감정 궤도, 미니 캘린더, '그때의 기록' 분석이
// 전부 여기서 나온다. AI 호출 없이 buildArchive() 결과만으로 결정적으로 계산한다.
//
// 문장의 주어는 언제나 '기록'이다. 이 수치는 곡에 붙인 감정 태그의 집계이지
// 사람의 심리 측정이 아니다 (docs/EMOTION-MODEL.md).
import {
  emotionCenter, emotionEntropy, diversityLabel, moodType, moveLabel,
  MOOD_MIN_SAMPLE,
} from "./emotion-model.js";

const tally = (values) => {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

const latest = (items) => items.reduce((best, item) => (!best || item.published > best.published ? item : best), null);

// 대표 곡: dominant 감정이 있는 곡 중 가장 최근 기록. 대표 영화: 별점이 가장 높은 것
// (동률이면 최근). '그 달에 실제로 있는 항목'만 나올 수 있는 구조다.
function representative(items, dominant) {
  const songs = items.filter((item) => item.type === "song");
  const movies = items.filter((item) => item.type === "movie");
  const domSongs = dominant ? songs.filter((item) => item.emotion === dominant) : [];
  const repSong = latest(domSongs.length ? domSongs : songs);
  const repMovie = movies.length
    ? movies.reduce((best, m) => {
        const r = (x) => (typeof x.rating === "number" ? x.rating : -1);
        return !best || r(m) > r(best) || (r(m) === r(best) && m.published > best.published) ? m : best;
      }, null)
    : null;
  return { repSong, repMovie };
}

// 월별 통계 — entries는 buildArchive() 결과(날짜 오름차순). 반환도 월 오름차순.
// prev는 '기록이 있는 직전 달'이다. 사이가 비면 gap에 건너뛴 달 수가 남는다 —
// 궤도 차트가 실선(연속)과 점선(건너뜀)을 가르는 근거.
export function monthlyStats(entries) {
  const byMonth = new Map();
  for (const entry of entries) {
    const month = entry.day.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(entry);
  }
  const months = [...byMonth.keys()].sort();
  const stats = months.map((month) => {
    const days = byMonth.get(month);
    const items = days.flatMap((d) => d.items);
    const songs = items.filter((item) => item.type === "song");
    const movies = items.filter((item) => item.type === "movie");
    const emotions = tally(songs.map((item) => item.emotion));
    const center = emotionCenter(songs.map((item) => item.emotion));
    const entropy = emotionEntropy(emotions);
    const dominant = emotions[0]?.[0] || "";
    return {
      month,
      days: days.length,
      songs: songs.length,
      movies: movies.length,
      count: items.length,
      emotions,
      dominant,
      center,
      entropy,
      diversity: emotions.length ? diversityLabel(emotions) : "",
      type: moodType(center, { entropy }),
      sparse: !center || center.n < MOOD_MIN_SAMPLE,
      keywords: tally(songs.flatMap((item) => item.keywords || [])),
      themes: tally(movies.flatMap((item) => item.themes || [])),
      ...representative(items, dominant),
    };
  });
  for (let i = 1; i < stats.length; i++) {
    const prev = stats[i - 1];
    const curr = stats[i];
    const gap = (new Date(`${curr.month}-01`) - new Date(`${prev.month}-01`)) / (30.44 * 86400e3);
    curr.prev = { month: prev.month, gap: Math.round(gap) - 1 };
    curr.move = prev.center && curr.center ? moveLabel(prev.center, curr.center) : "";
    if (prev.center && curr.center) {
      curr.prev.dv = curr.center.v - prev.center.v;
      curr.prev.da = curr.center.a - prev.center.a;
    }
  }
  return stats;
}

// 미니 캘린더 — 해당 연도 1..12월을 전부 돌려준다. 기록이 없는 달은 recorded:false.
export function yearCalendar(stats, year) {
  const byMonth = new Map(stats.map((s) => [s.month, s]));
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const s = byMonth.get(month);
    return {
      month,
      monthNum: i + 1,
      recorded: Boolean(s),
      days: s?.days || 0,
      songs: s?.songs || 0,
      movies: s?.movies || 0,
    };
  });
}

export const statYears = (stats) => [...new Set(stats.map((s) => s.month.slice(0, 4)))].sort();

// 두 해의 같은 달을 한 행에 맞춘다. 기록이 없는 달도 null로 남겨 비교 화면이
// 없는 값을 이어 그리지 않도록 한다.
export function compareYearStats(stats, firstYear, secondYear) {
  const byMonth = new Map(stats.map((stat) => [stat.month, stat]));
  return Array.from({ length: 12 }, (_, index) => {
    const monthNum = index + 1;
    const suffix = String(monthNum).padStart(2, "0");
    return {
      monthNum,
      first: byMonth.get(`${firstYear}-${suffix}`) || null,
      second: byMonth.get(`${secondYear}-${suffix}`) || null,
    };
  });
}

// 여러 해의 같은 달을 합쳐 계절성을 본다. 곡 수가 아니라 서로 다른 연도가 3개
// 이상이어야 반복이라고 부를 수 있다. 중심은 각 달의 감정 표본 수로 가중한다.
export function monthSeasonality(stats, minYears = 3) {
  return Array.from({ length: 12 }, (_, index) => {
    const monthNum = index + 1;
    const records = stats.filter((stat) => Number(stat.month?.slice(5)) === monthNum && stat.center);
    const years = [...new Set(records.map((stat) => stat.month.slice(0, 4)))].sort();
    const sample = records.reduce((sum, stat) => sum + (stat.center.n || 0), 0);
    const center = sample ? {
      v: records.reduce((sum, stat) => sum + stat.center.v * stat.center.n, 0) / sample,
      a: records.reduce((sum, stat) => sum + stat.center.a * stat.center.n, 0) / sample,
      n: sample,
    } : null;
    const deferred = years.length < minYears;
    const type = deferred || !center ? "판단 유보" : moodType(center);
    return {
      monthNum,
      years,
      sample,
      center,
      deferred,
      type,
      summary: deferred
        ? `${years.length}개 연도만 기록되어 계절성을 판단하지 않는다.`
        : `${years.length}개 연도의 ${monthNum}월 기록은 '${type}' 영역에 모였다.`,
    };
  });
}

export function releaseRecordGaps(songs) {
  const buckets = [["같은 해", 0], ["1–4년", 0], ["5–9년", 0], ["10–19년", 0], ["20–39년", 0], ["40년+", 0]];
  const rows = [];
  let missing = 0;
  for (const song of songs) {
    const releaseText = String(song.year || "");
    const recordedText = String(song.published || song.date || "").slice(0, 4);
    if (!/^\d{4}$/.test(releaseText) || !/^\d{4}$/.test(recordedText)) { missing += 1; continue; }
    const release = Number(releaseText);
    const recorded = Number(recordedText);
    const gap = Math.max(0, recorded - release);
    const index = gap === 0 ? 0 : gap < 5 ? 1 : gap < 10 ? 2 : gap < 20 ? 3 : gap < 40 ? 4 : 5;
    buckets[index][1] += 1;
    rows.push({ slug: song.slug, title: song.title, release, recorded, gap });
  }
  return { known: rows.length, missing, buckets, oldest: rows.sort((a, b) => b.gap - a.gap || a.title.localeCompare(b.title, "ko")).slice(0, 5) };
}

const typeConclusion = {
  "밝은 확장": "밝은 쪽으로 뻗어 나간 달로 남았다",
  "고요한 회복": "낮은 각성 속에서 밝기를 되찾은 달로 남았다",
  "긴장된 저항": "높은 각성으로 어두움을 밀어낸 달로 남았다",
  "깊은 침잠": "어둡고 고요한 바닥으로 가라앉은 달로 남았다",
  "흔들리는 탐색": "방향을 정하지 못한 채 각성이 높았던 달로 남았다",
  "몽환적 유예": "판단을 미룬 채 낮게 떠 있던 달로 남았다",
  "복합 정서": "여러 정서가 결론 없이 뒤섞인 달로 남았다",
};

const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
export const workLabel = (item) =>
  item?.type === "movie" ? `${item.title} — ${item.subtitle || "감독 미상"}` : item ? `${item.subtitle} — ${item.title}` : "";

// '그때의 기록' 월간 분석 — 밀도·구성 → 감정과 좌표 → 이동 → 키워드·주제 →
// 대표작 → 결론. 최소 2문장. 표본이 적으면 단정하지 않는다.
export function monthNarrative(stat) {
  if (!stat || !stat.count) return "";
  const s = [];
  const mix = [stat.songs && `음악 ${stat.songs}곡`, stat.movies && `영화 ${stat.movies}편`].filter(Boolean).join("과 ");
  s.push(`${stat.days}일에 걸쳐 ${mix}이 남았다.`);
  if (stat.sparse) {
    s.push("감정 기록이 적어 월 전체의 흐름으로 단정하기 어렵다.");
    if (stat.repSong) s.push(`이 달의 기록으로는 ${workLabel(stat.repSong)}이 남아 있다.`);
    return s.join(" ");
  }
  const near = Math.abs(stat.center.v) < 0.5 && Math.abs(stat.center.a) < 0.5 ? "중립 부근" : `'${stat.type}' 영역`;
  s.push(`감정은 ${stat.dominant}을 중심으로 ${stat.diversity} 양상이고, 정서 좌표(밝기 ${fmt1(stat.center.v)} · 각성 ${fmt1(stat.center.a)})는 ${near}에 있다.`);
  if (stat.move) s.push(`직전 기록 달(${Number(stat.prev.month.slice(5))}월)과 견주면 ${stat.move}이다.`);
  const kw = stat.keywords.slice(0, 2).map(([k]) => k);
  const th = stat.themes.slice(0, 2).map(([t]) => t);
  if (kw.length || th.length) {
    const parts = [];
    if (kw.length) parts.push(`가사에는 ${kw.join("·")} 같은 말이 되풀이되고`);
    if (th.length) parts.push(`영화는 ${th.join("·")}의 이야기로 이어진다`);
    s.push(`${parts.join(", ")}.`);
  }
  const reps = [stat.repSong && workLabel(stat.repSong), stat.repMovie && workLabel(stat.repMovie)].filter(Boolean);
  const conclusion = typeConclusion[stat.type] || "흐름을 단정하기 어려운 달로 남았다";
  if (reps.length) s.push(`이 흐름이 가장 짙게 밴 기록은 ${reps.join(", 그리고 ")}이며, 이달의 기록은 ${conclusion}.`);
  else s.push(`이달의 기록은 ${conclusion}.`);
  return s.join(" ");
}

// 연간 일대기 — 월별 문장 이어붙이기가 아니라 연 전체의 궤적을 요약한다.
export function yearNarrative(stats, year) {
  const ys = stats.filter((s) => s.month.startsWith(`${year}-`));
  const withCenter = ys.filter((s) => s.center && !s.sparse);
  if (!ys.length) return "";
  const mm = (m) => `${Number(m.slice(5))}월`;
  if (withCenter.length < 3) {
    return `${year}년에는 ${ys.length}개 달에 기록이 남았지만, 감정 기록이 충분한 달이 적어 한 해의 흐름으로 읽기는 어렵다.`;
  }
  const s = [];
  const first = withCenter[0];
  const last = withCenter[withCenter.length - 1];
  const dv = last.center.v - first.center.v;
  const da = last.center.a - first.center.a;
  const vDir = dv > 0.4 ? "밝아졌고" : dv < -0.4 ? "어두워졌고" : "밝기를 유지했고";
  const aDir = da > 0.4 ? "각성은 높아졌다" : da < -0.4 ? "각성은 가라앉았다" : "각성도 비슷하게 유지됐다";
  s.push(`${year}년의 기록은 ${mm(first.month)} '${first.type}'에서 ${mm(last.month)} '${last.type}'로 움직이며, 연초보다 ${vDir} ${aDir}.`);
  // 가장 큰 변곡점 — 직전 기록 달 대비 이동 벡터가 가장 긴 달
  const turning = ys
    .filter((m) => m.prev?.dv !== undefined)
    .reduce((best, m) => {
      const d = Math.hypot(m.prev.dv, m.prev.da);
      return !best || d > best.d ? { m, d } : best;
    }, null);
  if (turning && turning.d > 0.4) {
    const t = turning.m;
    const reps = [t.repSong && workLabel(t.repSong), t.repMovie && workLabel(t.repMovie)].filter(Boolean);
    s.push(`가장 큰 변곡점은 ${mm(t.month)}로, ${t.move || "정서 좌표가 크게 이동"}이며 ${reps.length ? `그 이동은 ${reps.join(", ")}에서 가장 분명하게 드러난다.` : "이동의 폭이 가장 컸다."}`);
  }
  // 가장 오래 이어진 정서 유형
  let run = { type: "", len: 0 };
  let curr = { type: "", len: 0 };
  for (const m of withCenter) {
    curr = m.type === curr.type ? { type: curr.type, len: curr.len + 1 } : { type: m.type, len: 1 };
    if (curr.len > run.len) run = { ...curr };
  }
  if (run.len >= 2) s.push(`가장 오래 이어진 정서는 '${run.type}'(${run.len}개월)이다.`);
  const diverse = withCenter.reduce((best, m) => (!best || m.entropy > best.entropy ? m : best), null);
  if (diverse && diverse.entropy >= 0.6) s.push(`감정의 폭이 가장 넓었던 달은 ${mm(diverse.month)}(${diverse.diversity})였다.`);
  const kw = tally(ys.flatMap((m) => m.keywords.slice(0, 3).map(([k]) => k))).slice(0, 2).map(([k]) => k);
  const th = tally(ys.flatMap((m) => m.themes.slice(0, 2).map(([t]) => t))).slice(0, 2).map(([t]) => t);
  if (kw.length || th.length)
    s.push(`한 해를 관통한 말은 ${[kw.join("·"), th.length ? `영화의 ${th.join("·")}` : ""].filter(Boolean).join(", ")}이다.`);
  return s.join(" ");
}
