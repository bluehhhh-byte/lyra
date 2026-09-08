import assert from "node:assert/strict";
import fs from "node:fs";
import { monthlyStats } from "./archive-stats.js";
import { movieNeeds } from "./admin/dashboard.js";

// 브리프 §10 Phase 3 — 영화도 감정 좌표를 가진다. 궤도·월간 분석·결손 진단이
// 곡과 영화를 같은 15어휘로 다뤄야 두 세계의 비대칭이 사라진다.

const entries = [
  {
    day: "2026-09-01",
    items: [
      { type: "song", emotion: "고독", keywords: [], published: "2026-09-01T10:00:00Z" },
      { type: "song", emotion: "그리움", keywords: [], published: "2026-09-01T11:00:00Z" },
      { type: "song", emotion: "", keywords: [], published: "2026-09-01T12:00:00Z" },
      { type: "movie", emotion: "위로", themes: [], rating: 4, published: "2026-09-01T13:00:00Z" },
      { type: "movie", emotion: "", themes: [], rating: 3, published: "2026-09-01T14:00:00Z" },
    ],
  },
];

const [month] = monthlyStats(entries);
assert.equal(month.center.n, 3, "감정 있는 곡 2 + 영화 1 = 표본 3 — 영화가 좌표에 들어가야 한다");
assert.ok(month.emotions.some(([name]) => name === "위로"), "영화의 감정이 월 집계에 나타나야 한다");
assert.equal(month.songs, 3, "곡 수는 그대로다");
assert.equal(month.movies, 2, "영화 수도 그대로다");

// 감정 없는 영화는 결손이다 — 예외 목록 없이 진단 한 곳에서 (절대 규칙 3)
const base = { tags: ["일본"], comment: "x", synopsis: "y", year: 2022, poster: "p" };
assert.deepEqual(movieNeeds({ ...base, emotion: "위로" }), [], "감정 있는 영화는 결손 없음");
assert.deepEqual(movieNeeds({ ...base }), ["감정"], "감정 없는 영화는 '감정' 결손");
assert.deepEqual(movieNeeds({ ...base, emotion: "아무말" }), ["감정"], "15어휘 밖의 값은 감정이 아니다");

// 화면 계약 — 등록 폼과 저장 API가 같은 어휘를 쓴다
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
assert.match(read("app/admin/movie-form.js"), /EMOTIONS\.map/, "영화 등록 폼에 곡과 같은 감정 셀렉터가 있어야 한다");
assert.match(read("app/api/admin/movies.js"), /emotion: \$\{parseEmotion\(emotion\)/, "저장은 검증된 감정만 프론트매터에 쓴다");

console.log("movie emotion contract passed");
