// 일본어 제목 곡은 관리자 등록곡 검색에서 일본어로만 찾혔다 — 저장된 어느 칸에도
// 로마자가 없었기 때문이다. 등록할 때 미국 스토어 표기를 별칭으로 받아 둔다.
//   node lib/romaji-alias.test.mjs
import assert from "node:assert/strict";
import { romanizedTitle } from "./admin/lrclib.js";
import { filterAdminSongs } from "./admin/song-search.js";

const withFetch = async (handler, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
};
const store = (trackName) => async (url) => {
  assert.match(String(url), /country=US/, "로마자는 미국 스토어에만 있다");
  return { ok: true, json: async () => ({ results: [{ trackName }] }) };
};

assert.equal(await withFetch(store("MYAKU"), () => romanizedTitle(1624684700)), "MYAKU");
assert.equal(
  await withFetch(store("脈"), () => romanizedTitle(1624684700)),
  "",
  "미국 스토어도 일본어 제목을 쓰면 별칭으로 삼을 것이 없다",
);
assert.equal(await withFetch(store("MYAKU"), () => romanizedTitle("")), "", "trackId가 없으면 조회하지 않는다");
assert.equal(
  await withFetch(store("MYAKU"), () => romanizedTitle(1, () => 0)),
  "",
  "남은 예산이 없으면 조회하지 않는다",
);

// 별칭이 있어야 로마자로 찾힌다 — 이 검색이 보는 칸에는 로마자가 따로 없다
const bare = { slug: "dir-en-grey-脈", title: "脈", title_ko: "맥", artist: "DIR EN GREY", album: "脈 - Single" };
const aliased = { ...bare, search_aliases: ["MYAKU"] };
assert.equal(filterAdminSongs([bare], "myaku").length, 0);
assert.equal(filterAdminSongs([aliased], "myaku").length, 1);
assert.equal(filterAdminSongs([aliased], "脈").length, 1, "원제로도 그대로 찾힌다");

console.log("✓ 일본어 제목 곡을 로마자로도 찾는다");
