import assert from "node:assert/strict";
import { crossMatches } from "./cross-match.js";

const source = { year: 2021, tags: ["일본"], keywords: ["기억"] };
const matches = crossMatches(source, [
  { slug: "weak", year: 2022, tags: ["미국"], themes: ["사랑"] },
  { slug: "strong", year: 2020, tags: ["일본"], themes: ["기억"] },
  { slug: "old", year: 1999, tags: ["일본"], themes: ["기억"] },
], { countries: ["일본", "미국"] });
assert.equal(matches[0].slug, "strong", "권역과 주제를 함께 공유한 항목 우선");
assert.equal(matches.length, 2, "같은 연대만 교차 연결");
assert.match(matches[0].crossReason, /일본.*기억/, "연결 근거 제공");
console.log("✓ Lyra–Cyno 교차 연결 점수와 근거");
