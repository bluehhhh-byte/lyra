import assert from "node:assert/strict";
import { applyGenre, genreStatus, withGenreTag } from "./admin/genre-fix.js";

const song = (fm) => `---\n${fm}\n---\n첫 줄이다\n> first line\n`;

// 장르 자리만 갈아 끼운다 — 국가·연도는 자리를 지킨다
{
  assert.deepEqual(withGenreTag(["일본", "Rock", "1999"], "J-Rock"), ["일본", "J-Rock", "1999"]);
  assert.deepEqual(withGenreTag(["한국", "2020"], "Hip-Hop"), ["한국", "Hip-Hop", "2020"]);
  assert.deepEqual(withGenreTag(["영미"], "Folk"), ["영미", "Folk"]);
}

// 상태 판정 — 판정은 tags를, 화면 문구는 genre: 를 쓴다. 둘을 따로 보고한다.
{
  const s = genreStatus(song("title: T\ngenre: Rock\ntags: [일본, J-Rock, 1999]\nyear: 1999"));
  assert.equal(s.field, "Rock");
  assert.equal(s.tagGenre, "J-Rock");
  assert.equal(s.issue, null, "태그 장르 자체는 온전하다");
  assert.equal(s.drift, true, "두 값이 어긋난 것은 잡아낸다");

  const coarse = genreStatus(song("title: T\ngenre: Rock\ntags: [일본, Rock, 1999]\nyear: 1999"));
  assert.equal(coarse.issue, "세분화 권장");
  assert.equal(coarse.drift, false);

  const foreign = genreStatus(song("title: T\ngenre: 록\ntags: [한국, 록, 2001]\nyear: 2001"));
  assert.equal(foreign.issue, "비표준 장르");
}

// 저장하면 두 곳이 함께 바뀐다 — 한쪽만 고쳐 어긋난 채 남는 일이 없어야 한다
{
  const out = applyGenre(song("title: T\ngenre: Rock\ntags: [일본, Rock, 1999]\nyear: 1999"), "J-Rock");
  assert.match(out, /^genre: J-Rock$/m);
  assert.match(out, /^tags: \[일본, J-Rock, 1999\]$/m);
  const after = genreStatus(out);
  assert.equal(after.issue, null);
  assert.equal(after.drift, false);
  assert.ok(out.endsWith("첫 줄이다\n> first line\n"), "본문은 그대로다");
}

// 어휘 밖 값은 저장하지 않는다 — 조용히 새 장르가 생기면 판정이 무너진다
{
  assert.throws(() => applyGenre(song("title: T\ngenre: Rock\ntags: [일본, Rock]\nyear: 1999"), "제이록"), /어휘에 없습니다/);
  assert.throws(() => applyGenre(song("title: T\ngenre: Rock\ntags: [일본, Rock]\nyear: 1999"), ""), /어휘에 없습니다/);
}

// 두 번 적용해도 같다
{
  const raw = song("title: T\ngenre: 록\ntags: [한국, 록, 2001]\nyear: 2001");
  assert.equal(applyGenre(applyGenre(raw, "Indie Rock"), "Indie Rock"), applyGenre(raw, "Indie Rock"));
}

console.log("✓ 장르 — genre 필드와 tags를 함께 쓴다");
