// 인스타 임포터 재실행 안전성 — 같은 내보내기를 다시 넣어도 아무것도 안 바뀌어야 한다.
// 예전 임포터는 iTunes 결과에서 아티스트만 맞아도 곡을 채택했고, 재실행하면
// 지웠던 오매칭이 되살아났다. 지금 임포터는 메타를 아예 안 쓰고(백필로 분리),
// 중복은 title+artist와 source_hash 둘 다로 막는다. 그 회귀가 이 테스트다.
//   node lib/instagram-import.test.mjs
import assert from "node:assert/strict";
import { planImport, parseHeader, extractBody, convert } from "./admin/instagram.js";
import { parseFrontmatter, parseLyrics } from "./songs.js";

const post = (caption, ts = 1700000000) => ({ caption, ts });
const POSTS = [
  post(`| Radiohead - Creep (크리프, 1992)
But I'm a creep
난 괴짜야
I'm a weirdo
난 이상한 놈이야
What the hell am I doing here
난 도대체 여기서 뭘 하고 있는 걸까
I don't belong here
난 여기 어울리지 않아
#어쩌고 #240101_0900`),
  post(`| 검정치마 - 강아지
우리 강아지 이름은 검정치마
털이 까매서 검정치마
자꾸 짖어서 미안해
그래도 사랑해
#240102_1000`),
  post(`| Someone - Header Only
#241231_2359`), // 가사 없음 → pending
  post(`제목 형식이 아님`), // 헤더 파싱 실패 → review
];

// 1회차 — 빈 컬렉션
const first = planImport(POSTS, []);
assert.equal(first.files.length, 2, "가사 있는 곡 2개 저장");
assert.equal(first.pending.length, 1, "가사 없는 게시글은 대기열");
assert.equal(first.review.length, 1, "헤더 파싱 실패는 검토");
assert.equal(first.dupSkipped, 0);
console.log("✓ 최초 임포트 — 저장·대기·검토 분류");

// 원문 보존: `> `만 벗기면 캡션 본문과 같아야 한다
for (const f of first.files) {
  const { body } = parseFrontmatter(f.md);
  const stripped = body.trimEnd().split("\n").map((l) => l.replace(/^> /, ""));
  const src = extractBody(POSTS.find((p) => p.caption.includes(parseFrontmatter(f.md).meta.title)).caption).lines;
  assert.deepEqual(stripped, src, `${f.slug}: 무손실`);
}
console.log("✓ 무손실 — 저장 본문에서 `> `만 빼면 원본 캡션");

// 메타는 임포트가 채우지 않는다 (엄격 매칭 백필의 몫)
for (const f of first.files) {
  const { meta } = parseFrontmatter(f.md);
  for (const k of ["artwork", "preview", "trackId", "duration", "album", "genre"])
    assert.equal(meta[k], "", `${f.slug}: ${k}는 임포트가 채우지 않음`);
  assert.ok(meta.source_hash && meta.source_body_hash, "원본 해시 기록");
}
console.log("✓ 메타 미기입 — 커버·미리듣기는 meta-backfill 담당");

// 2회차 — 1회차 결과를 기존 컬렉션으로 넣고 같은 내보내기 재실행
const asSongs = first.files.map((f) => {
  const { meta } = parseFrontmatter(f.md);
  return { slug: f.slug, ...meta, tags: [], stanzas: [] };
});
const second = planImport(POSTS, asSongs);
assert.equal(second.files.length, 0, "재실행: 새로 쓸 곡 없음");
assert.equal(second.dupSkipped, 2, "재실행: 기존 곡 2개 모두 중복 스킵");
console.log("✓ 재실행 안전 — 같은 내보내기는 아무것도 덮어쓰지 않음");

// 제목을 손으로 고친 뒤 재실행해도 source_hash로 같은 게시글을 알아본다
const renamed = asSongs.map((s) => ({ ...s, title: `${s.title} (수정본)`, title_ko: "" }));
assert.equal(planImport(POSTS, renamed).files.length, 0, "제목을 고쳐도 source_hash로 중복 인식");
console.log("✓ 제목 수정 후에도 source_hash로 중복 인식");

// 같은 실행 안에 같은 곡이 두 번 있어도 하나만 저장
assert.equal(planImport([POSTS[0], POSTS[0]], []).files.length, 1, "한 실행 내 중복도 1개만");
console.log("✓ 한 실행 내 중복 게시글도 1개만 저장");

// 파서 단위 규칙
assert.deepEqual(parseHeader("| Radiohead - Creep (크리프, 1992)"), {
  artist: "Radiohead", title: "Creep", title_ko: "크리프", year: "1992",
});
assert.equal(parseHeader("헤더 아님"), null);
// 한글 우세 곡은 `> `를 붙이지 않는다 (원문만)
const ko = convert(["우리 강아지 이름은 검정치마", "털이 까매서 검정치마"]);
assert.equal(ko.lang, "ko");
assert.ok(!ko.out.some((l) => l.startsWith(">")), "한국어 곡에는 번역 표시를 붙이지 않음");
// 영어 원문 + 한글 번역 쌍만 `> `
const en = convert(["But I'm a creep", "난 괴짜야"]);
assert.deepEqual(en.out, ["But I'm a creep", "> 난 괴짜야"]);
assert.equal(en.lang, "en");
console.log("✓ 헤더·본문 변환 규칙");

// 저장 본문이 실제 파서로 다시 읽히는지 (프론트매터·가사 왕복)
const creep = first.files.find((f) => f.slug.includes("creep"));
const stanzas = parseLyrics(parseFrontmatter(creep.md).body);
assert.equal(stanzas[0].lines[0].en, "But I'm a creep");
assert.equal(stanzas[0].lines[0].ko, "난 괴짜야");
console.log("✓ 저장 결과가 곡 파서로 그대로 읽힘");

console.log("all passed");
