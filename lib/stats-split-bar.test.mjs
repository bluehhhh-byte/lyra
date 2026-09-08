import assert from "node:assert/strict";
import fs from "node:fs";
import { emotionUsage } from "./emotion-model.js";

// 통계의 감정 막대는 곡·영화를 한 판에 담되 층을 가른다 (브리프 §10 Phase 3).
// 합쳐 세면 영화가 사라지고, 따로 그리면 같은 어휘를 쓴다는 사실이 사라진다.

const songs = [{ emotion: "사랑" }, { emotion: "사랑" }, { emotion: "고독" }, { emotion: "" }];
const movies = [{ emotion: "사랑" }, { emotion: "위로" }, { emotion: "" }];

const combined = emotionUsage([...songs, ...movies].map((r) => r.emotion));
const byLabel = new Map(combined);
assert.equal(byLabel.get("사랑"), 3, "곡 2 + 영화 1이 한 막대에 담긴다");
assert.equal(byLabel.get("위로"), 1, "영화만 쓴 감정도 판에 나타난다");
assert.equal(byLabel.get("고독"), 1, "곡만 쓴 감정은 그대로");
assert.equal(combined.length, 15, "쓰이지 않은 감정도 0회로 남는다");

const movieOnly = new Map(emotionUsage(movies.map((m) => m.emotion)));
assert.equal(movieOnly.get("사랑"), 1, "영화 층은 영화만 센다");
assert.equal(movieOnly.get("고독"), 0, "곡만 쓴 감정의 영화 층은 0");
// 막대의 곡 칸 = 전체 − 영화 칸. 음수가 나오면 두 집계의 출처가 어긋난 것이다.
for (const [label, n] of combined) assert.ok(n - (movieOnly.get(label) || 0) >= 0, `${label}: 곡 칸이 음수가 되면 안 된다`);

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const charts = read("app/stats/charts.js");
assert.match(charts, /\(n - sub\) \/ max/, "곡 칸은 전체에서 영화 칸을 뺀 만큼이어야 한다");
assert.match(charts, /sub \/ max/, "영화 칸도 같은 척도로 그려야 한다 — 눈에 띄게 하려고 부풀리지 않는다");

const stats = read("app/stats/page.js");
assert.match(stats, /\[\.\.\.songs, \.\.\.movies\]\.map\(\(record\) => record\.emotion\)/, "감정 집계는 곡과 영화를 함께 센다");
assert.match(stats, /감정을 아직 고르지 않은 영화/, "세지 않은 영화가 몇 편인지 밝혀야 한다");

console.log("stats split bar contract passed");
