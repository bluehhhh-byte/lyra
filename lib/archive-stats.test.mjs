// 월별·연간 정서 통계와 분석 문장 — 감정 궤도·미니 캘린더·'그때의 기록'의 근거.
//   node lib/archive-stats.test.mjs
import assert from "node:assert/strict";
import { buildArchive } from "./archive.js";
import { monthlyStats, yearCalendar, statYears, compareYearStats, monthNarrative, releaseRecordGaps, yearNarrative, workLabel } from "./archive-stats.js";

const song = (slug, date, emotion, extra = {}) => ({
  slug, title: `T-${slug}`, artist: `A-${slug}`, artwork: "/a.jpg", date, emotion,
  keywords: ["밤"], ...extra,
});
const movie = (slug, date, extra = {}) => ({
  slug, title: `M-${slug}`, director: `D-${slug}`, poster: "/m.jpg", date, rating: 4, themes: ["기억"], ...extra,
});

// 3월(어두움·저각성) → 5월(밝음) — 4월은 기록이 없다
const archive = buildArchive({
  songs: [
    song("s1", "2026-03-02", "슬픔"), song("s2", "2026-03-05", "고독"), song("s3", "2026-03-09", "슬픔"),
    song("s4", "2026-05-01", "기쁨"), song("s5", "2026-05-03", "희망"), song("s6", "2026-05-07", "기쁨"),
    song("s7", "2026-05-07", "설렘"),
    song("s8", "2026-06-02", "위로"), song("s9", "2026-06-10", "위로"), song("s10", "2026-06-20", "회상"),
  ],
  movies: [movie("m1", "2026-03-05"), movie("m2", "2026-05-03", { rating: 5 })],
});
const stats = monthlyStats(archive);

// 월 집계와 좌표
{
  assert.deepEqual(stats.map((s) => s.month), ["2026-03", "2026-05", "2026-06"]);
  assert.equal(stats[2].type, "고요한 회복", "위로·회상은 밝음·저각성");
  const mar = stats[0], may = stats[1];
  assert.equal(mar.songs, 3);
  assert.equal(mar.movies, 1);
  assert.equal(mar.days, 3);
  assert.equal(mar.type, "깊은 침잠", "슬픔·고독은 어두움·저각성");
  assert.equal(may.type, "밝은 확장");
  assert.ok(mar.center.v < 0 && mar.center.a < 0);
  assert.ok(may.center.v > 0 && may.center.a > 0);
}
console.log("✓ 월별 감정 중심 좌표");

// 이동 벡터 — 직전 '기록 달' 기준, 건너뛴 달을 표시
{
  const may = stats[1];
  assert.equal(may.prev.month, "2026-03");
  assert.equal(may.prev.gap, 1, "4월을 건너뛰었다");
  assert.ok(may.prev.dv > 0, "3월→5월은 밝아지는 이동");
  assert.match(may.move, /밝아지는 중/);
  assert.match(may.move, /각성도 상승/);
}
console.log("✓ 이동 벡터·건너뛴 달");

// 대표작은 그 달에 실제로 있는 항목이고, 표기 규칙을 지킨다
{
  const may = stats[1];
  assert.ok(["s4", "s6"].includes(may.repSong.slug), "대표 곡은 dominant 감정의 곡");
  assert.equal(may.repMovie.slug, "m2");
  assert.equal(workLabel(may.repSong), `A-${may.repSong.slug} — T-${may.repSong.slug}`, "음악은 아티스트 — 제목");
  assert.equal(workLabel(may.repMovie), "M-m2 — D-m2", "영화는 제목 — 감독");
}
console.log("✓ 대표 작품 실존·표기");

// 미니 캘린더 — 12칸 전부, 기록 없는 달은 비활성
{
  const cal = yearCalendar(stats, "2026");
  assert.equal(cal.length, 12);
  assert.equal(cal[2].recorded, true);
  assert.equal(cal[3].recorded, false, "4월은 기록 없음");
  assert.equal(cal[2].days, 3);
  assert.deepEqual(statYears(stats), ["2026"]);
}
console.log("✓ 연도별 기록 월·빈 월");

// 연도 비교 — 두 해의 같은 달을 같은 행에 놓고 빈 달은 값으로 꾸미지 않는다
{
  const compared = compareYearStats([
    { month: "2022-09", center: { v: -1, a: 0 } },
    { month: "2026-09", center: { v: 1, a: 2 } },
    { month: "2026-10", center: { v: 0, a: 0 } },
  ], "2022", "2026");
  assert.equal(compared.length, 12);
  assert.equal(compared[8].first.month, "2022-09");
  assert.equal(compared[8].second.month, "2026-09");
  assert.equal(compared[9].first, null);
  assert.equal(compared[9].second.month, "2026-10");
}
console.log("✓ 두 연도 같은 달 정렬");

// 월간 분석 — 행동 나열로 끝나지 않고, 좌표·이동·대표작이 실제로 들어간다
{
  const text = monthNarrative(stats[1]);
  assert.ok(!/기록했고|감상했고|모아두었/.test(text), "행동 나열 금지");
  assert.match(text, /밝은 확장/);
  assert.match(text, /밝아지는 중/);
  assert.match(text, /A-s\d — T-s\d/, "대표 곡 아티스트 — 제목");
  assert.match(text, /M-m2 — D-m2/, "대표 영화 제목 — 감독");
  assert.ok(text.split(". ").length >= 2, "최소 2문장");
}

// 표본이 적은 달은 단정하지 않는다
{
  const sparse = monthlyStats(buildArchive({
    songs: [song("x1", "2026-07-01", "불안")],
    movies: [],
  }));
  assert.equal(sparse[0].type, "판단 유보");
  assert.match(monthNarrative(sparse[0]), /단정하기 어렵다/);
}
console.log("✓ 월간 분석·판단 유보");

// 연간 일대기 — 연초→연말 이동과 변곡점, 데이터 부족 연도는 한계 표시
{
  const bio = yearNarrative(stats, "2026");
  assert.match(bio, /깊은 침잠/);
  assert.match(bio, /고요한 회복/, "연말 유형");
  assert.match(bio, /변곡점.*5월/s, "가장 큰 이동이 있는 달");
  const thin = yearNarrative(monthlyStats(buildArchive({ songs: [song("y", "2025-01-01", "사랑")], movies: [] })), "2025");
  assert.match(thin, /읽기는 어렵다/);
}
console.log("✓ 연간 일대기·변곡점");
const gaps = releaseRecordGaps([
  { slug: "a", title: "A", year: 1970, date: "2026-01-01" },
  { slug: "b", title: "B", year: 2024, published: "2026-01-01T10:00:00+09:00" },
  { slug: "c", title: "C", year: "", date: "2026-01-01" },
]);
assert.equal(gaps.known, 2);
assert.equal(gaps.missing, 1);
assert.equal(gaps.buckets.find(([label]) => label === "40년+")[1], 1);
assert.equal(gaps.oldest[0].gap, 56);
console.log("✓ 발매연도와 기록연도 간극 분포");
console.log("all passed");
