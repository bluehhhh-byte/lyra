// 작품 사용 정보의 결손 판정과 그 주변 계약.
//
// 판정은 lib/appearance-gaps.js의 gapsOf 한 곳에서만 한다. 화면·자동
// 채움·붙여넣기 적용이 서로 다른 규칙을 보면 "메웠는데 아직 결손"이 나온다.
//   node --test lib/appearance-gaps.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { gapsOf } from "./appearance-gaps.js";

const full = {
  id: "x", songSlug: "s", workTitle: "더 드라마",
  director_ko: "크리스토페르 보르글리", director: "Kristoffer Borgli",
  year: 2026, status: "verified",
};

test("a complete entry has no gaps", () => {
  assert.equal(gapsOf(full), null);
});

test("the three things the caption line needs are the three gaps", () => {
  // 캡션 한 줄이 `& 감독, 영화 <작품> 엔딩 (연도) |` 이라 감독·연도가 없으면
  // 그 줄이 반만 나간다. 공개되지 않으면 아예 나가지 않는다.
  assert.deepEqual(gapsOf({ ...full, director_ko: "", director: "" }), ["director"]);
  assert.deepEqual(gapsOf({ ...full, year: null }), ["year"]);
  assert.deepEqual(gapsOf({ ...full, status: "pending" }), ["status"]);
  assert.deepEqual(gapsOf({ ...full, director_ko: "", director: "", year: null, status: "pending" }), [
    "director", "year", "status",
  ]);
});

test("either spelling of the director counts as filled", () => {
  // 한글 표기가 원칙이지만, 원문만 있어도 캡션은 그것으로 한 줄을 만든다
  assert.equal(gapsOf({ ...full, director_ko: "" }), null);
  assert.equal(gapsOf({ ...full, director: "" }), null);
});

test("a missing evidence URL is not a gap", () => {
  // 조사를 AI가 먼저 하게 되면서 주소로 남지 않는 출처가 많아졌다. 그것을
  // 결손으로 세면 영영 0이 되지 않는 목록이 된다.
  assert.equal(gapsOf({ ...full, evidenceUrl: "" }), null);
});

test("saving no longer demands an evidence URL", () => {
  // '확인됨'으로 공개하려면 http(s) 주소를 요구하던 규칙을 뺐다. 주소를 채우려고
  // 아무 페이지나 붙이거나, 맞는 정보를 '검토 필요'로 묻어 두게 됐기 때문이다.
  const source = fs.readFileSync(new URL("../app/api/admin/appearances.js", import.meta.url), "utf8");
  assert.ok(!/확인된 정보에는 http\(s\) 근거 주소가 필요합니다/.test(source), "필수 규칙이 남아 있다");
  // 형식 검사는 남는다 — 주소를 넣었다면 주소여야 한다
  assert.match(source, /item\.evidenceUrl && !validWebUrl\(item\.evidenceUrl\)/);
  // 지어낸 주소를 막는 것은 저장이 아니라 AI 조사 쪽 일이다
  const research = fs.readFileSync(new URL("./admin/appearance-search.js", import.meta.url), "utf8");
  assert.match(research, /evidenceUrl은 반드시 위 목록에 있는 것이어야 한다/);
});

test("the admin tool is actually mounted", () => {
  // 컴포넌트만 만들고 화면에 걸지 않으면 조용히 죽은 코드가 된다
  const page = fs.readFileSync(new URL("../app/admin/tools/page.js", import.meta.url), "utf8");
  assert.match(page, /import AppearanceGaps from "\.\.\/appearance-gaps"/);
  assert.match(page, /<AppearanceGaps \/>/);
});

test("the work search asks TMDB in both languages", () => {
  // `Parasite`를 ko-KR로만 검색하면 「패러사이트 돌즈」가 1위로 오고 「기생충」은
  // 밀린다. 친 언어 쪽 1위가 목록 1위여야 한다.
  const tmdb = fs.readFileSync(new URL("./tmdb.js", import.meta.url), "utf8");
  assert.match(tmdb, /searchOnce\(query, "ko-KR"\)/);
  assert.match(tmdb, /searchOnce\(query, "en-US"\)/);
  assert.match(tmdb, /\/\[가-힣\]\/\.test\(query\)/, "친 언어로 순서를 정해야 한다");
  // 원제를 함께 보여야 한국어 표기를 모르는 작품을 알아본다
  const editor = fs.readFileSync(new URL("../app/admin/song-appearance-editor.js", import.meta.url), "utf8");
  assert.match(editor, /result\.originalTitle !== result\.title/);
});
