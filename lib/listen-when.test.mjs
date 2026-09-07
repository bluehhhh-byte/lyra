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

console.log("✓ listen_when 정리 규칙");
