// 홈 그룹 나누기 — 헤더의 곡 수는 필터된 전체 기준의 진짜 수여야 한다.
// 렌더 캡(72장)이 걸린 부분집합을 그룹화했을 때 수가 틀어지고 뒤쪽 그룹이
// 사라지던 회귀를 고정한다.
import assert from "node:assert/strict";
import { groupSongs } from "./browse-group.js";

const song = (i, country, decade, artist) => ({ slug: `s${i}`, country, decade, artist });
const list = [
  ...Array.from({ length: 50 }, (_, i) => song(i, "한국", "2010s", "이바디")),
  ...Array.from({ length: 30 }, (_, i) => song(100 + i, "일본", "2000s", "요네즈 켄시")),
  ...Array.from({ length: 20 }, (_, i) => song(200 + i, "영미", "1990s", "Radiohead")),
];

// country — 큰 그룹 먼저, 수는 전체 기준
{
  const groups = groupSongs(list, "country");
  assert.deepEqual(groups.map(([name, l]) => [name, l.length]), [
    ["한국", 50], ["일본", 30], ["영미", 20],
  ]);
}

// decade — 최신 연대 먼저
{
  const groups = groupSongs(list, "decade");
  assert.deepEqual(groups.map(([name]) => name), ["2010s", "2000s", "1990s"]);
}

// artist — 큰 그룹 먼저, 빈 값은 "기타"
{
  const groups = groupSongs([...list, { slug: "x", artist: "" }], "artist");
  assert.equal(groups[0][0], "이바디");
  assert.equal(groups[0][1].length, 50);
  assert.ok(groups.some(([name]) => name === "기타"), "그룹 값이 없는 곡은 기타로 모인다");
}

// none/random — 그룹 없이 통짜
assert.equal(groupSongs(list, "none").length, 1);
assert.equal(groupSongs(list, "none")[0][1].length, 100);

console.log("✓ 그룹 나누기 — 전체 기준 수·정렬");
