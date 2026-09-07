// 커버 카드의 "이런 순간에" 한 줄 — 정리 규칙 검증.
//   node lib/listen-when.test.mjs
import assert from "node:assert/strict";
import { cleanListenWhen, LISTEN_WHEN_RULE } from "./listen-when.js";

// 모델이 붙이는 장식을 벗긴다
assert.equal(cleanListenWhen("「좋아하는 마음이 무서워지기 시작할 때」"), "좋아하는 마음이 무서워지기 시작할 때");
assert.equal(cleanListenWhen('"잊었다고 말한 사람이 떠오른 밤."'), "잊었다고 말한 사람이 떠오른 밤");
assert.equal(cleanListenWhen("  물러설 수 없는 아침…  "), "물러설 수 없는 아침");
assert.equal(cleanListenWhen("한 줄\n두 줄"), "한 줄 두 줄", "줄바꿈은 공백으로 접는다");

// 카드 한 줄에 못 들어가는 것은 버린다 — 한국어를 중간에서 자르면 깨진다
assert.equal(cleanListenWhen("이 문장은 서른 자를 훌쩍 넘겨서 커버 카드 한 줄에 절대 들어갈 수 없는 길이다"), "");
assert.equal(cleanListenWhen("#해시태그가 든 문구일 때"), "");
assert.equal(cleanListenWhen(""), "");
assert.equal(cleanListenWhen(null), "");

// Gemini 스키마와 배치 생성이 같은 규칙 문장을 쓴다
assert.match(LISTEN_WHEN_RULE, /^listenWhen: /);
assert.match(LISTEN_WHEN_RULE, /12~22자/);

// 곡 페이지는 카드에 넘길 song 객체를 필드를 골라 담아 만든다 — 여기 빠지면
// DB에 있어도 카드에 안 뜬다. 실제로 한 번 빠뜨렸다.
import fs from "node:fs";
const page = fs.readFileSync(new URL("../app/songs/[slug]/page.js", import.meta.url), "utf8");
assert.match(page, /listen_when: song\.listen_when/, "곡 페이지가 listen_when을 카드까지 전달해야 한다");
const card = fs.readFileSync(new URL("../app/songs/[slug]/lyric-card.js", import.meta.url), "utf8");
assert.match(card, /cleanListenWhen\(song\.listen_when\)/, "커버 카드가 listen_when을 그린다");
// 제목이 두 줄인 곡에서 훅이 통째로 빠졌던 적이 있다 — 자리 다툼이 없도록
// 아예 아트 안에 앉히고, 그릴지 말지는 문구 유무로만 정한다.
assert.match(card, /if \(hook\) \{/, "훅은 자리 조건 없이 언제나 그린다");
// 인스타 헤드라인 문법: 어둠막을 길게 깔고 두 줄까지 큼직하게
assert.match(card, /const scrimHeight = hook \? 360 : 120/, "훅이 있으면 아트 아래 어둠막을 길게 끈다");
assert.match(card, /for \(const size of \[58, 54, 50, 46, 42, 38\]\)/, "머리글은 두 줄에 들어가는 가장 큰 크기로 그린다");
assert.match(card, /headlineLines\.length <= 2/, "세 줄이 되면 머리글이 아니라 문단이다");
assert.match(card, /wrapTight\(ctx, hook, headlineMax/, "「…싶은 / 밤」처럼 한 글자만 넘긴 줄은 당겨 붙인다");
assert.match(card, /shadowColor/, "밝은 앨범 아트 위에서도 흰 글자가 뭉개지지 않아야 한다");
assert.match(page, /data-listen-when/, "가사 페이지 코멘트 구역에도 listen_when을 보여준다");

console.log("✓ listen_when 정리 규칙");
