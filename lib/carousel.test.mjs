// 캐러셀 조립 — 5장 구성(커버·곡 설명·가사 3분할)과 분배 규칙을 고정한다.
import assert from "node:assert/strict";
import {
  buildCarousel, splitLines, autoSelect, CAROUSEL_SLIDES, LYRIC_PARTS,
} from "./carousel.js";

const line = (i, en, ko = `tr${i}`) => ({ en, ko, stanza: Math.floor(i / 4), section: "" });
const NINE = [
  "난 저기 숲이 돼볼게", "너는 자그맣기만 한 언덕 위를", "오르며 날 바라볼래",
  "나의 작은 마음 한구석이어도 돼", "길을 터 보일게 나를 베어도 돼", "날 지나치지 마 날 보아줘",
  "나는 널 들을게 이젠 말해도 돼", "아, 숲이 아닌 바다이던가", "옆에는 높은 나무가 있길래",
].map((en, i) => line(i, en));
const NOTE = "자신을 숲이라 했다가 바다가 아니었느냐고 되묻기를 반복한다.";

// 5장 구성 — 커버 · 곡 설명 · 가사×3
{
  const { slides, error } = buildCarousel({ selected: NINE, note: NOTE });
  assert.equal(error, "");
  assert.equal(slides.length, CAROUSEL_SLIDES);
  assert.deepEqual(slides.map((s) => s.role), ["cover", "about", "lyrics", "lyrics", "lyrics"]);

  // 1장 커버 — 가사도 해설도 싣지 않는다. 전용 렌더러가 앨범 아트를 그린다.
  assert.deepEqual(slides[0].lines, []);

  // 2장 곡 설명 — 해설이 제 장을 갖는다
  assert.equal(slides[1].note, NOTE);
  assert.deepEqual(slides[1].lines, []);

  // 3~5장 — 아홉 줄이 3/3/3으로, 순서 그대로
  assert.deepEqual(slides.slice(2).map((s) => s.lines.length), [3, 3, 3]);
  assert.equal(slides[2].lines[0].en, "난 저기 숲이 돼볼게");
  assert.equal(slides[4].lines[2].en, "옆에는 높은 나무가 있길래");
  assert.ok(slides[2].lines[0].ko, "가사 장에는 번역이 붙는다");
  assert.equal(slides[2].label, "가사 1/3");
}

// 분배 — 앞 조각이 크거나 같게, 순서 보존
{
  assert.deepEqual(splitLines(NINE.slice(0, 7)).map((c) => c.length), [3, 2, 2]);
  assert.deepEqual(splitLines([...NINE, line(9, "열 번째 줄")]).map((c) => c.length), [4, 3, 3]);
  const flat = splitLines(NINE).flat().map((l) => l.en);
  assert.deepEqual(flat, NINE.map((l) => l.en), "나눠도 순서는 그대로다");
}

// 줄이 세 장보다 적으면 — 빈 카드를 만들지 않고 조각 수를 줄인다
{
  const { slides } = buildCarousel({ selected: NINE.slice(0, 2), note: NOTE });
  assert.equal(slides.length, 4, "커버 + 설명 + 가사 2장");
  assert.deepEqual(slides.slice(2).map((s) => s.lines.length), [1, 1]);
}

// 빈 줄은 세지 않는다
{
  const withBlank = [NINE[0], { en: "  ", ko: "", stanza: 0 }, NINE[1]];
  assert.deepEqual(splitLines(withBlank).map((c) => c.length), [1, 1]);
}

// 아무것도 안 고르면 에러 — 조용히 빈 캐러셀을 내지 않는다
{
  const { slides, error } = buildCarousel({ selected: [], note: NOTE });
  assert.equal(slides.length, 0);
  assert.match(error, /골라/);
}

// 해설이 없어도 곡 설명 장은 남는다 — 렌더러가 곡 정보로 채운다
{
  const { slides } = buildCarousel({ selected: NINE, note: "" });
  assert.equal(slides[1].role, "about");
  assert.equal(slides[1].note, "");
}

// 기본 선택 — 누른 줄부터 아홉 줄, 연 경계를 넘어 이어 담는다
{
  const many = Array.from({ length: 20 }, (_, i) => line(i, `줄 ${i}`));
  assert.deepEqual(autoSelect(many, 0, 9), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(autoSelect(many, 5, 9), [5, 6, 7, 8, 9, 10, 11, 12, 13]);
  // 뒤쪽에서 시작해 아홉 줄이 안 되면 앞에서 채운다
  assert.equal(autoSelect(many, 17, 9).length, 9);
  assert.ok(autoSelect(many, 17, 9).includes(19), "끝 줄을 버리지 않는다");
  assert.ok(autoSelect(many, 17, 9).includes(14), "앞에서 채워 아홉 줄을 맞춘다");
}

assert.equal(LYRIC_PARTS, 3);
console.log("✓ 캐러셀 — 5장 구성·3분할·자동 선택");
