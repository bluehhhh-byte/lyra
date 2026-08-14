// 인스타 보류 195건 분류 — 한 덩어리로는 손댈 수 없다.
//   node scripts/triage-pending.mjs [--write]
//
// 보류는 "캡션에 가사가 4줄도 없어 자동 반영하지 않은 게시글"이다. 그런데 그 안에
// 성격이 다른 것들이 섞여 있다: 이미 가진 곡의 재게시, 영화 글, 헤더 파싱이 깨진 줄,
// 그리고 진짜로 가사 없이 올린 곡. 무엇이 몇 건인지부터 갈라 놓는다.
import fs from "fs";
import { getAllSongs } from "../lib/songs.js";
import { getAllMovies } from "../lib/movies.js";
import { getWatched } from "../lib/watched.js";
import { normText } from "../lib/admin/itunes.js";

const WRITE = process.argv.includes("--write");
const items = JSON.parse(fs.readFileSync("data/instagram-pending.json", "utf8")).items || [];

const songs = getAllSongs();
const songKey = new Set(
  songs.flatMap((s) => [normText(`${s.title}|${s.artist}`), normText(`${s.title_ko || ""}|${s.artist}`)])
);
const songTitles = new Map(songs.map((s) => [normText(s.title), s.slug]));
const movieTitles = new Map(
  [...getAllMovies().map((m) => [m.title, m.slug]), ...getWatched().map((m) => [m.title, m.code])]
    .map(([t, id]) => [normText(t), id])
);

const buckets = { 보유중: [], 영화글: [], 파싱깨짐: [], 신규곡: [] };
for (const it of items) {
  const title = String(it.title || "").trim();
  const artist = String(it.artist || "").trim();
  const row = { title, artist, year: it.year || "", tag: it.tag || "", ts: it.ts || 0 };

  // 제목에 인용부호가 통째로 들어왔거나 지나치게 길면 헤더 파싱이 깨진 것이다
  if (title.length > 60 || /["“”]/.test(title)) { buckets.파싱깨짐.push(row); continue; }
  // 같은 제목의 영화가 있으면 영화 글 (이 계정은 음악과 영화를 함께 올린다)
  if (movieTitles.has(normText(title)) && !songTitles.has(normText(title))) {
    buckets.영화글.push({ ...row, movie: movieTitles.get(normText(title)) });
    continue;
  }
  if (songKey.has(normText(`${title}|${artist}`))) { buckets.보유중.push(row); continue; }
  // 제목만 같은 곡이 이미 있으면 표기 차이일 가능성 — 사람이 확인해야 한다
  if (songTitles.has(normText(title))) {
    buckets.보유중.push({ ...row, note: `제목이 같은 곡 있음: ${songTitles.get(normText(title))}` });
    continue;
  }
  buckets.신규곡.push(row);
}

const out = { at: new Date().toISOString(), total: items.length, counts: {}, buckets };
for (const [k, v] of Object.entries(buckets)) out.counts[k] = v.length;
if (WRITE) fs.writeFileSync("data/instagram-pending-triage.json", JSON.stringify(out, null, 1));

console.log(`보류 ${items.length}건 분류${WRITE ? " → data/instagram-pending-triage.json" : " (미리보기)"}`);
for (const [k, v] of Object.entries(out.counts)) console.log(`  ${k} ${v}`);
for (const [k, v] of Object.entries(buckets)) {
  if (!v.length) continue;
  console.log(`\n[${k}] 표본`);
  for (const r of v.slice(0, 4)) console.log(`   ${r.artist} — ${r.title}${r.note ? ` (${r.note})` : ""}`);
}
