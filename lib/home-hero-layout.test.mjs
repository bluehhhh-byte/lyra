import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const home = await readFile(new URL("../app/home-intro.js", import.meta.url), "utf8");

assert.match(home, /aria-labelledby="cultural-biography-title"/);
assert.match(home, /<LatestDayText latest=\{latest\} \/>/);
assert.match(home, /sm:grid-cols-\[minmax\(0,1fr\)_17rem\]/);
assert.match(home, /<figure[\s\S]*<LatestDayScene latest=\{latest\}/);
assert.doesNotMatch(home, /<LatestDay latest=\{latest\}/);

console.log("✓ 문화 전기와 오늘의 기록 통합 히어로 레이아웃");
