import assert from "node:assert/strict";
import fs from "node:fs";
import { anniversaryRecords } from "./latest-day.js";

// 브리프 §10 Phase 2 — 역방향 연결과 홈 재발견 모듈의 계약.

// ── anniversaryRecords: 해가 다른 같은 월-일, 연도당 한 건, 올해 제외 ──
const songs = [
  { slug: "a-2023", title: "A", artist: "가", published: "2023-09-09T10:00:00+09:00" },
  { slug: "a-2023-later", title: "A2", artist: "가", published: "2023-09-09T21:00:00+09:00" },
  { slug: "b-2024", title: "B", artist: "나", date: "2024-09-09" },
  { slug: "other-day", title: "X", artist: "다", date: "2024-09-08" },
  { slug: "this-year", title: "Y", artist: "라", date: "2026-09-09" },
];
const movies = [{ slug: "m-2022", title: "필름", title_ko: "필름", director_ko: "감독", date: "2022-09-09" }];

const records = anniversaryRecords(songs, movies, "2026-09-09");
assert.deepEqual(records.map((r) => r.year), [2024, 2023, 2022], "가까운 해부터 연도당 한 건");
assert.equal(records[1].slug, "a-2023-later", "같은 해 안에서는 늦게 남긴 기록을 고른다");
assert.ok(!records.some((r) => r.slug === "this-year"), "올해 기록은 제외 — 상단 분석이 이미 다룬다");
assert.ok(!records.some((r) => r.slug === "other-day"), "다른 날짜는 제외");
assert.deepEqual(anniversaryRecords(songs, movies, "2026-01-01"), [], "과거 기록이 없는 날은 빈 배열 — 모듈째 사라진다");
assert.deepEqual(anniversaryRecords(songs, movies, ""), [], "날짜가 없으면 조용히 빈 배열");

// ── 화면 계약 ──
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const home = read("app/page.js");
assert.match(home, /pastToday\.length > 0 &&/, "홈 재발견 모듈은 기록 없는 날 통째로 사라져야 한다");
assert.match(home, /pastTodayLabel\}의 과거 기록/, "제목은 '오늘'이 아니라 날짜 — ISR 6시간 동안 '오늘'은 거짓이 될 수 있다");

const songPage = read("app/songs/[slug]/page.js");
assert.match(songPage, /motif-\$\{encodeURIComponent\(motif\.name\)\}/, "곡 상세는 인용된 모티프로 나가는 링크를 가져야 한다");

const motifsPage = read("app/songs/motifs/page.js");
assert.match(motifsPage, /id=\{`motif-\$\{m\.name\}`\}/, "모티프 섹션에 앵커 id가 있어야 링크가 도착한다");
assert.match(motifsPage, /scroll-mt-/, "앵커 도착 지점이 화면 상단에 가려지면 안 된다");

const moviePage = read("app/movies/[slug]/page.js");
assert.match(moviePage, /이 컬렉션에서/, "영화 상세에도 곡과 같은 자리-맥락 블록이 있어야 한다");
assert.match(moviePage, /편 중 하나/, "영화 블록은 편 수로 센다");

console.log("record axis contract passed");
