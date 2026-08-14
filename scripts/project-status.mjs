// 현황 숫자 자동 갱신 — 문서에 손으로 적은 숫자는 곧 낡는다.
//   node scripts/project-status.mjs [--write]
// data/project-status.json을 쓰고, PROJECT.md·README.md의 표시 구간을 바꾼다.
// 구간 표시: <!-- status:start --> … <!-- status:end -->
import fs from "fs";
import { execFileSync } from "child_process";
import { getAllSongs } from "../lib/songs.js";
import { getAllMovies } from "../lib/movies.js";
import { getWatched } from "../lib/watched.js";
import { songNeeds, summarizeNeeds } from "../lib/admin/needs.js";
import { isExactApple } from "../lib/apple.js";

const WRITE = process.argv.includes("--write");
const songs = getAllSongs(), movies = getAllMovies(), watched = getWatched();
const has = (f) => songs.filter(f).length;

const lintOut = (() => {
  try { return execFileSync(process.execPath, ["scripts/lint-data.mjs"], { encoding: "utf8" }); }
  catch (e) { return e.stdout || ""; }
})();
const lint = lintOut.match(/오류 (\d+) · 경고 (\d+)/) || [, "?", "?"];

const status = {
  at: new Date().toISOString().slice(0, 10),
  songs: songs.length,
  movies: movies.length,
  watched: watched.length,
  covers: has((s) => (s.artwork || "").startsWith("https")),
  previews: has((s) => s.preview),
  appleExact: songs.filter(isExactApple).length,
  years: has((s) => /^\d{4}$/.test(String(s.year || ""))),
  comments: has((s) => String(s.comment || "").trim()),
  keywords: has((s) => (s.keywords || []).length),
  emotions: has((s) => s.emotion),
  needsWork: songs.filter((s) => summarizeNeeds(s).length).length,
  translationGaps: songs.reduce((n, s) => n + songNeeds(s).translation, 0),
  readingGaps: songs.reduce((n, s) => n + songNeeds(s).reading, 0),
  lintErrors: Number(lint[1]),
  lintWarnings: Number(lint[2]),
};

const pct = (n) => `${n}/${status.songs} (${Math.round((n / status.songs) * 100)}%)`;
const block = [
  `<!-- status:start -->`,
  `_${status.at} 기준 · \`node scripts/project-status.mjs --write\`로 갱신_`,
  ``,
  `| 항목 | 수치 |`,
  `|---|---|`,
  `| 곡 | ${status.songs} |`,
  `| 영화(.md) · 평가한 영화 | ${status.movies} · ${status.watched} |`,
  `| 커버 | ${pct(status.covers)} |`,
  `| 미리듣기 | ${pct(status.previews)} |`,
  `| Apple 정확 링크 | ${pct(status.appleExact)} (나머지는 검색 링크) |`,
  `| 연도 | ${pct(status.years)} |`,
  `| 코멘트 · 키워드 · 감정 | ${pct(status.comments)} · ${pct(status.keywords)} · ${pct(status.emotions)} |`,
  `| 보완 대기 곡 | ${status.needsWork} |`,
  `| 남은 번역 · 독음 | ${status.translationGaps}줄 · ${status.readingGaps}줄 |`,
  `| 데이터 린트 | 오류 ${status.lintErrors} · 경고 ${status.lintWarnings} |`,
  `<!-- status:end -->`,
].join("\n");

fs.writeFileSync("data/project-status.json", JSON.stringify(status, null, 1));
let touched = 0;
for (const f of ["PROJECT.md", "README.md"]) {
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, "utf8");
  if (!src.includes("<!-- status:start -->")) continue;
  const out = src.replace(/<!-- status:start -->[\s\S]*?<!-- status:end -->/, block);
  if (out === src) continue;
  if (WRITE) fs.writeFileSync(f, out);
  touched++;
}
console.log(`곡 ${status.songs} · 커버 ${status.covers} · 린트 오류 ${status.lintErrors}/경고 ${status.lintWarnings}`);
console.log(`${WRITE ? "갱신" : "갱신 예정"} 문서 ${touched}개 · data/project-status.json 기록`);
