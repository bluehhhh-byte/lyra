// 1단계 — 데이터 상태 진단 (코드가 한다, 모델은 부르지 않는다).
//   node scripts/needs-work.mjs [--batch=30] [--field=keywords]
//
// 무엇이 비었는지·중복인지·근거가 약한지를 세어 data/needs-work.json에 적는다.
// 이 파일이 이후 단계(Gemini 선별 → Claude 생성 → 로컬 검증)의 입력이다.
// 판정 기준은 lib/admin/needs.js 한 곳만 쓴다.
import fs from "fs";
import { getAllSongs } from "../lib/songs.js";
import { getAllMovies } from "../lib/movies.js";
import { songNeeds, summarizeNeeds, isNoteLine } from "../lib/admin/needs.js";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=")[1];
const BATCH_SONG = Number(arg("batch", 30));   // 음악 30곡씩
const BATCH_MOVIE = 20;                        // 영화 20편씩
const FIELD = arg("field", "");

const songs = getAllSongs();
const rows = [];
for (const s of songs) {
  const n = songNeeds(s);
  // 가사에 실제로 나오지 않는 키워드가 대부분이면 근거가 약한 것으로 본다
  const text = s.stanzas.flatMap((st) => st.lines).map((l) => `${l.en || ""} ${l.ko || ""}`).join(" ");
  const kws = s.keywords || [];
  const ungrounded = kws.length && kws.filter((k) => !text.includes(k)).length >= Math.ceil(kws.length * 0.6);
  const hasLyrics = s.stanzas.flatMap((st) => st.lines).some((l) => (l.en || "").trim() && !isNoteLine(l.en));

  const needs = summarizeNeeds(s);
  if (ungrounded && hasLyrics) needs.push("키워드 근거 약함");
  if (!needs.length) continue;
  if (FIELD && !needs.some((t) => t.includes(FIELD))) continue;
  rows.push({
    id: s.slug, kind: "song", title: s.title, artist: s.artist,
    lang: s.lang, year: s.year || "", needs, counts: n,
  });
}

const movieRows = [];
for (const m of getAllMovies()) {
  const needs = [];
  if (!m.tags?.length) needs.push("태그 없음");
  if (!m.comment) needs.push("코멘트 없음");
  if (!m.synopsis?.length) needs.push("줄거리 없음");
  if (!m.year) needs.push("연도 없음");
  if (!m.poster) needs.push("포스터 없음");
  if (needs.length) movieRows.push({ id: m.slug, kind: "movie", title: m.title, director: m.director || "", needs });
}

// 배치로 잘라 둔다 — 대량 작업은 한 번에 다 넘기지 않는다
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const out = {
  at: new Date().toISOString(),
  total: { songs: songs.length, songsNeedingWork: rows.length, moviesNeedingWork: movieRows.length },
  byNeed: rows.flatMap((r) => r.needs).reduce((acc, t) => ((acc[t] = (acc[t] || 0) + 1), acc), {}),
  songBatches: chunk(rows, BATCH_SONG),
  movieBatches: chunk(movieRows, BATCH_MOVIE),
};
fs.writeFileSync("data/needs-work.json", JSON.stringify(out, null, 1));
console.log(`곡 ${rows.length}건 · 영화 ${movieRows.length}건 → data/needs-work.json`);
console.log(`배치: 곡 ${out.songBatches.length}개(${BATCH_SONG}곡씩) · 영화 ${out.movieBatches.length}개(${BATCH_MOVIE}편씩)`);
for (const [k, v] of Object.entries(out.byNeed).sort((a, b) => b[1] - a[1])) console.log(`  ${k} ${v}`);
