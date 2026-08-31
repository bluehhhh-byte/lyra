import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.js", import.meta.url), "utf8");

assert.match(page, /getAllSongsMeta, getSongRuntime/);
assert.match(page, /latestRecordedDay\(songMetas, allMovies\)/);
assert.match(page, /const latestSongs = latestDay\s*\?/);
assert.match(page, /kstDay\(song\.published \|\| song\.date\) === latestDay/);
assert.match(page, /getSongRuntime\(song\.slug\)/);
assert.doesNotMatch(page, /Promise\.all\(songMetas\.map/, "홈에서 전곡 상세 가사를 조회하면 안 된다");

console.log("✓ 홈은 최신 날짜의 곡 가사만 상세 조회한다");
