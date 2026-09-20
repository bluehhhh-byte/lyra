// 커버 카드의 "이런 순간에" 한 줄 — 정리 규칙 검증.
//   node lib/listen-when.test.mjs
import assert from "node:assert/strict";
import { cleanListenWhen, LISTEN_WHEN_RULE, TIME_WORDS, retimeListenWhen, timeWordFor } from "./listen-when.js";

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
assert.match(card, /for \(const size of \[72, 66, 60, 54, 48, 42\]\)/, "머리글은 두 줄에 들어가는 가장 큰 크기로 그린다");
// 캔버스는 로드되지 않은 굵기를 조용히 대체 서체로 그린다
const carousel = fs.readFileSync(new URL("./carousel.js", import.meta.url), "utf8");
assert.match(carousel, /800 72px "Pretendard Variable"/, "머리글 굵기도 미리 불러와야 한다");
assert.match(card, /headlineLines\.length <= 2/, "세 줄이 되면 머리글이 아니라 문단이다");
assert.match(card, /wrapTight\(ctx, hook, headlineMax/, "「…싶은 / 밤」처럼 한 글자만 넘긴 줄은 당겨 붙인다");
assert.match(card, /shadowColor/, "밝은 앨범 아트 위에서도 흰 글자가 뭉개지지 않아야 한다");
assert.match(page, /data-listen-when/, "가사 페이지 코멘트 구역에도 listen_when을 보여준다");

// ── 발행 시각에 맞춰 시간 낱말 바꾸기 ────────────────────────────────────
//
// listen_when의 60%(987곡 중 591곡)가 시간 낱말로 끝나고 그중 397곡이 「밤」이다.
// 곡을 등록한 시각에 맞춰 쓰였는데 캐러셀은 아무 때나 발행한다 — 아침에 올린
// 카드가 「…다짐하는 밤」이라고 말하면 보는 사람의 시간과 어긋난다.
const at = (hour) => new Date(2026, 8, 17, hour, 30);

// 경계는 한국어에서 그 말을 쓰는 대로
for (const [hour, word] of [
  [0, "새벽"], [5, "새벽"], [6, "아침"], [10, "아침"], [11, "낮"], [13, "낮"],
  [14, "오후"], [17, "오후"], [18, "저녁"], [20, "저녁"], [21, "밤"], [23, "밤"],
]) assert.equal(timeWordFor(at(hour)), word, `${hour}시`);
assert.deepEqual([...TIME_WORDS].sort(), ["낮", "밤", "새벽", "아침", "오후", "저녁"]);

// 끝 낱말만 바뀌고 장면은 그대로다
const scene = "힘든 시련을 이겨내고 다짐하는 밤";
assert.equal(retimeListenWhen(scene, at(8)), "힘든 시련을 이겨내고 다짐하는 아침");
assert.equal(retimeListenWhen(scene, at(19)), "힘든 시련을 이겨내고 다짐하는 저녁");
assert.equal(retimeListenWhen(scene, at(22)), scene, "이미 맞으면 그대로 둔다");

// 「날」·「때」·「순간」·「길」로 끝나는 396곡은 시간대가 아니라 상황이다
for (const line of ["오랜만에 편지를 쓰는 날", "아무 말도 하기 싫은 때", "버스 창에 기대 가는 길"])
  assert.equal(retimeListenWhen(line, at(8)), line);

// 「한밤」을 바꾸면 「한아침」이 된다 — 앞에 공백이 있어야 독립된 낱말이다
assert.equal(retimeListenWhen("도시가 잠든 한밤", at(8)), "도시가 잠든 한밤");
assert.equal(retimeListenWhen("밤", at(8)), "밤", "문장이 시간 낱말 하나뿐이면 바꿀 장면이 없다");
assert.equal(retimeListenWhen("", at(8)), "");

// 원작자의 고유한 장면/정서 표현(예: "하얀 밤")이 임의로 바뀌지 않도록 원본 그대로 표시한다
assert.match(card, /const hook = cleanListenWhen\(song\.listen_when\);/, "커버가 listen_when 원본을 보존해 그린다");
assert.ok(!/retimeListenWhen/.test(card), "커버 카드에서 시간 낱말을 임의로 바꾸지 않는다");
assert.ok(!/retimeListenWhen/.test(page), "곡 페이지는 기록 그대로 보여 준다");

console.log("✓ listen_when 정리 규칙 · 원본 표현 유지");
