// 관리자 외부 곡 검색의 실제 품질을 같은 기준으로 반복 측정한다.
// Apple 호출은 사례당 한 국가·한 번으로 제한한다. 검색원은 Apple 하나뿐이다.
import fs from "node:fs";
import { getAllSongs } from "../lib/songs.js";
import { itunesToResult, searchItunesStorePage } from "../lib/admin/itunes.js";
import {
  buildSearchQueries,
  knownArtistSet,
  mergeExternalSongResults,
  searchQualityMetrics,
} from "../lib/admin/music-search.js";

const cases = JSON.parse(fs.readFileSync(new URL("../lib/admin-search-quality-cases.json", import.meta.url), "utf8"));
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const selected = limitArg ? cases.slice(0, Math.max(1, Number(limitArg.split("=")[1]) || 1)) : cases;
const songs = getAllSongs();
const knownArtists = knownArtistSet(songs);
const resultsByQuery = {};

for (const item of selected) {
  const variants = buildSearchQueries(item.query, songs);
  const externalQuery = variants.at(-1) || item.query;
  const apple = await searchItunesStorePage(externalQuery, item.country || "US", { limit: 50, offset: 0 });
  resultsByQuery[item.query] = mergeExternalSongResults([apple.results.map(itunesToResult)], variants, knownArtists);
}

const report = searchQualityMetrics(selected, resultsByQuery);
console.table(report.rows.map((row) => ({ query: row.query, rank: row.rank || "MISS", results: row.resultCount })));
for (const row of report.rows.filter((item) => !item.rank || item.rank > 1)) {
  console.log(`\n${row.query} 상위 후보:`);
  for (const result of (resultsByQuery[row.query] || []).slice(0, 5)) console.log(`  ${result.artist} — ${result.title} [${result.sourceLabel}]`);
}
console.log(`Top 1 ${report.top1}/${report.total} (${Math.round(report.top1Rate * 100)}%)`);
console.log(`Top 5 ${report.top5}/${report.total} (${Math.round(report.top5Rate * 100)}%) · 결과 없음 ${report.zeroResult}`);
if (report.top1Rate < 0.75 || report.top5Rate < 0.875 || report.zeroResult > 1) process.exitCode = 1;
