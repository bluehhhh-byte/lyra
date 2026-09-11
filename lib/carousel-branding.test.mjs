import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  CAROUSEL_SLIDES,
  CAROUSEL_TRUNCATED_HEIGHT,
  CAROUSEL_TRUNCATED_NOTE,
  buildCarousel,
  carouselBodyBox,
  carouselFooterReserve,
  carouselTruncatedNoteY,
} from "./carousel.js";
import { emotionToWash, WASH_TINT_ALPHA } from "./emotion-color.js";

const card = fs.readFileSync(new URL("../app/songs/[slug]/lyric-card.js", import.meta.url), "utf8");
const studio = fs.readFileSync(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
const chrome = fs.readFileSync(new URL("./carousel-chrome.js", import.meta.url), "utf8");
const line = (n) => ({ en: `line ${n}`, ko: `줄 ${n}` });
const lines = (n) => Array.from({ length: n }, (_, i) => line(i + 1));
// 정의부(export function …)는 호출이 아니므로 빼고 센다
const callsOf = (source, fn) => (source.match(new RegExp(String.raw`(?<!function )${fn}\(ctx`, "g")) || []).length;

// ── 워터마크 ──────────────────────────────────────────────────────────────
test("the handle is defined once and both decks draw it", () => {
  // 저장·스크린샷으로 퍼질 때 출처가 남아야 한다. 워드마크는 Lyra./Cyno.로
  // 갈리지만 계정은 하나라, 핸들은 한 곳에만 적혀 있어야 한다.
  assert.match(chrome, /export const INSTAGRAM_HANDLE = "@lyra\.cyno"/);
  for (const [name, source] of [["가사 카드", card], ["영화 카드", studio]]) {
    assert.ok(!/@lyra\.cyno/.test(source), `${name}이 핸들을 따로 들고 있다`);
    assert.match(source, /from "\.\.\/\.\.\/\.\.\/lib\/carousel-chrome"/, `${name}이 공유 서명을 안 쓴다`);
  }
  assert.equal(callsOf(card, "drawSignature"), 3, "가사: 표지·곡 설명·가사");
  // 영화: 머리글(2~5장) · 단일 표지 · 큐레이션 표지
  assert.equal(callsOf(studio, "drawSignature"), 3);
  // 워드마크를 직접 찍으면 핸들 없는 서명이 다시 생긴다
  assert.ok(!/fillText\("Cyno\."/.test(studio), "영화 카드가 워드마크를 직접 찍는다");
  assert.ok(!/fillText\("Lyra\."/.test(card), "가사 카드가 워드마크를 직접 찍는다");
});

test("the signature is dimmer than the wordmark it follows", () => {
  // 서명이지 제목이 아니다. 본문보다 앞서 읽히면 안 된다.
  const block = chrome.slice(chrome.indexOf("export function drawSignature"), chrome.indexOf("export function drawTruncatedNote"));
  assert.match(block, /rgba\(246,241,228,0\.7\)/, "워드마크");
  assert.match(block, /rgba\(246,241,228,0\.52\)/, "핸들은 한 단 옅게");
});

test("the cover reserves the whole signature, handle included", () => {
  // 서명에 핸들을 붙이면서 표지의 태그 줄은 여전히 워드마크 폭만 비워 두고
  // 있었다 — 키워드가 많은 곡이면 `#태그`가 @lyra.cyno 위로 올라탄다.
  const cover = card.slice(card.indexOf("async function drawCoverCard"), card.indexOf("async function drawAboutCard"));
  assert.match(cover, /const room = W - pad \* 2 - measureSignature\(ctx, \{ markSize: SIGNATURE_MARK_SIZE \}\)\.total/);
  assert.ok(!/measureText\("Lyra\."\)/.test(cover), "표지가 워드마크만 재면 안 된다 — measureSignature를 쓴다");
  // 재는 크기와 그리는 크기가 갈리면 예약이 다시 어긋난다
  assert.equal((cover.match(/SIGNATURE_MARK_SIZE/g) || []).length, 2, "예약과 렌더가 같은 상수를 본다");
  // 표지 여백은 pad(96)이고 PAD(84)가 아니다 — 큐만 12px 밖으로 나가 있었다
  assert.match(cover, /drawSwipeCue\(ctx, \{ x: W - pad \}\)/);

  // 영화 표지도 같은 함정을 갖고 있었다 — 워드마크 폭만 빼고 태그를 실었다
  assert.match(studio, /const room = W - PAD \* 2 - measureSignature\(ctx, \{ mark: MARK, markSize: MARK_SIZE \}\)\.total/);
  assert.ok(!/measureText\("Cyno\."\)/.test(studio));
});

// ── 마지막 장 표시 ───────────────────────────────────────────────────────
test("only the last visible lyric slide is flagged", () => {
  const { slides } = buildCarousel({ selected: lines(21), note: "해설" });
  const lyricSlides = slides.filter((s) => s.role === "lyrics");
  assert.ok(lyricSlides.length > 1);
  assert.equal(lyricSlides.at(-1).isLast, true);
  for (const slide of lyricSlides.slice(0, -1)) assert.equal(slide.isLast, false, "앞 장은 그대로다");
  // 커버·설명 장은 애초에 대상이 아니다
  assert.ok(slides.filter((s) => s.role !== "lyrics").every((s) => !s.isLast));
});

test("the flag lands on the slide that survives the five-card cut", () => {
  // 6장이 나올 만큼 골라도 실제로 나가는 건 5장이다. slice 전에 표시하면
  // 보이지 않는 장에 표시가 붙는다.
  const { slides } = buildCarousel({ selected: lines(21), note: "해설" });
  assert.equal(slides.length, CAROUSEL_SLIDES);
  assert.equal(slides.at(-1).isLast, true);
});

test("only a truncated last slide costs the body any height", () => {
  // 잘리지 않은 곡에서 자리를 빼면 가사가 공연히 작아진다
  assert.equal(carouselFooterReserve({ isLast: false }), 0);
  assert.equal(carouselFooterReserve({ isLast: true }), 0, "완곡은 표시가 없다");
  assert.equal(carouselFooterReserve({ isLast: false, truncated: true }), 0, "마지막 장만");
  assert.equal(carouselFooterReserve({ isLast: true, truncated: true }), CAROUSEL_TRUNCATED_HEIGHT);
  assert.match(card, /carouselBodyBox\(\{ isLast, truncated \}\)/, "예산에서 먼저 뺀다");
});

test("the truncation note sits between the body floor and the signature", () => {
  // 예약 높이와 그리는 자리를 두 파일에 따로 적어 둬서, 표시가 예약 띠를 벗어나
  // 본문 마지막 줄에 붙었다 — 실측으로 본문 1050행, 표시 1051행. 이제 한 곳에서
  // 계산하고 그 순서를 여기서 못 박는다.
  const noteY = carouselTruncatedNoteY();
  const NOTE_SIZE = 24; // drawTruncatedNote의 italic 500 24px
  const bodyFloor = carouselBodyBox({ isLast: true, truncated: true }).bottom;
  const SIGNATURE_TOP = 1350 - 56 - 27; // drawSignature(H-56), markSize 27

  assert.ok(noteY - NOTE_SIZE > bodyFloor, `표시 윗선 ${noteY - NOTE_SIZE} ≤ 본문 바닥 ${bodyFloor}`);
  assert.ok(noteY < SIGNATURE_TOP, `표시 ${noteY}가 서명 ${SIGNATURE_TOP}을 밀어낸다`);
  // 예약하지 않은 높이에 그리면 본문이나 서명을 덮는다
  assert.ok(
    noteY - bodyFloor <= CAROUSEL_TRUNCATED_HEIGHT,
    "표시는 자기 몫으로 예약한 띠 안에 있어야 한다",
  );
});

test("the cards ask for nothing", () => {
  // 권유 문구("프로필 링크"·"저장해 두세요")를 뺐다 — 카드가 부탁하는 그림이 된다.
  // 남는 건 잘렸다는 사실뿐이고, 그건 부탁이 아니라 정보다.
  for (const [name, source] of [["가사 카드", card], ["영화 카드", studio], ["공용", chrome]]) {
    assert.ok(!/프로필 링크/.test(source), `${name}에 권유 문구가 남아 있다`);
    assert.ok(!/저장해 두세요/.test(source), `${name}에 저장 권유가 남아 있다`);
  }
  assert.ok(!/프로필 링크/.test(CAROUSEL_TRUNCATED_NOTE), "생략 표시도 링크를 권하지 않는다");
  assert.match(card, /if \(isLast && truncated\) drawTruncatedNote/);
  // 푸터가 없으니 영화 카드는 자리를 비울 이유도 없다 — 원래 배치로 돌아간다
  assert.match(studio, /ctx\.fillText\(line, PAD, 1120 \+ index \* 38\)/);
  assert.match(studio, /ctx\.rect\(PAD, 760, W - PAD \* 2, 400, 28\)/);
});

// ── 발췌 생략 표시 ────────────────────────────────────────────────────────
test("a truncated song says so; a complete one stays quiet", () => {
  const cut = buildCarousel({ selected: lines(21), note: "", totalLines: 40 });
  assert.equal(cut.slides.at(-1).truncated, true);

  const whole = buildCarousel({ selected: lines(9), note: "", totalLines: 9 });
  assert.equal(whole.slides.at(-1).truncated, false);

  // totalLines를 모르면 단정하지 않는다 — 모르는 것을 "잘렸다"고 하지 않는다
  const unknown = buildCarousel({ selected: lines(9), note: "" });
  assert.equal(unknown.slides.at(-1).truncated, false);
});

test("the truncation note states the fact and stops there", () => {
  assert.match(CAROUSEL_TRUNCATED_NOTE, /이하 생략/);
});

test("only real lyric lines count toward truncation", () => {
  // 빈 줄·섹션 라벨을 세면 멀쩡한 완곡이 잘린 것으로 표시된다
  assert.match(card, /allLines\.filter\(\(line\) => String\(line\?\.en \|\| ""\)\.trim\(\)\)\.length/);
});

// ── 스와이프 큐 ───────────────────────────────────────────────────────────
test("the swipe cue is on the cover and nowhere else", () => {
  assert.match(card, /export const SWIPE_CUE = "→ 넘겨서 가사 보기"/);
  assert.equal((card.match(/(?<!function )drawSwipeCue\(ctx/g) || []).length, 1);
  // 표지는 페이지 칩도 진행점도 그리지 않아 우상단이 비어 있다
  const cover = card.slice(card.indexOf("async function drawCoverCard"), card.indexOf("async function drawAboutCard"));
  assert.match(cover, /drawSwipeCue/);
  assert.ok(!/drawPageNumber/.test(cover), "표지에 페이지 칩이 생기면 큐와 겹친다");
});

// ── 감정색 워시 ───────────────────────────────────────────────────────────
test("a known emotion tints the wash, an unknown one leaves it alone", () => {
  const known = emotionToWash("그리움");
  assert.equal(known.tint, "hsl(252, 30%, 18%)");
  assert.equal(known.alpha, WASH_TINT_ALPHA);

  for (const value of ["없는감정", "", undefined, null]) {
    const none = emotionToWash(value);
    assert.equal(none.tint, "", `${value}: 억지로 색을 만들지 않는다`);
    assert.equal(none.alpha, 0);
    assert.equal(none.base, "#181410", "지금 워시 그대로");
  }
});

test("the tint is hsl, because canvas oklch support is uneven", () => {
  // emotionColor는 oklch를 돌려주는데 fillStyle이 그걸 무시하면 틴트가
  // 조용히 사라진다 — 사라진 걸 알아채기도 어렵다
  for (const emotion of ["사랑", "저항", "몽환", "희망"]) {
    assert.match(emotionToWash(emotion).tint, /^hsl\(\d+, 30%, 18%\)$/);
  }
});

test("the tint stays light enough to keep ink readable", () => {
  // 잉크(#f6f1e4)가 얹히는 배경이라 밝기와 알파에 상한이 필요하다
  assert.ok(WASH_TINT_ALPHA <= 0.18, `알파 ${WASH_TINT_ALPHA} — 본문 대비를 해친다`);
  const { tint } = emotionToWash("기쁨");
  const lightness = Number(tint.match(/(\d+)%\)$/)[1]);
  assert.ok(lightness <= 22, `명도 ${lightness}% — scrim 위에서 너무 밝다`);
});

test("a song with no artwork falls back to its emotion, not to a black square", () => {
  assert.match(card, /ctx\.fillStyle = wash\.base/);
  assert.match(card, /drawArtWash\(ctx, art, 0\.66, song\.emotion\)/);
});

// ── 배선 ─────────────────────────────────────────────────────────────────
test("every prop the card renderers read is actually declared in scope", () => {
  // hashtagSets를 Caption 안에서 쓰는데 선언은 CardModal에만 있어, 카드가 통째로
  // 안 그려진 적이 있다. 문자열만 보는 검사로는 못 잡는다 — 함수별로 쓰는 이름이
  // 그 함수의 매개변수에 있는지 본다.
  const named = ["hashtagSets", "isLast", "truncated"];
  for (const fn of ["Caption", "CardModal", "drawCard"]) {
    const start = card.search(new RegExp(String.raw`(?:async )?function ${fn}\(`));
    assert.ok(start >= 0, `${fn}을 찾지 못했다`);
    const header = card.slice(start, card.indexOf(")", start) + 1);
    const body = card.slice(start, start + 4000);
    for (const prop of named) {
      // 스코프가 필요한 건 "값으로 읽는" 이름뿐이다. 다음 둘은 아니다:
      //   slide.isLast      — 다른 객체의 속성
      //   { isLast: ... }   — 객체 리터럴의 키
      const bare = new RegExp(String.raw`(?<![.\w])${prop}\b(?!\s*:)`);
      if (!bare.test(body)) continue;
      assert.match(header, new RegExp(String.raw`\b${prop}\b`), `${fn}이 ${prop}을 쓰는데 인자로 받지 않는다`);
    }
  }
});
