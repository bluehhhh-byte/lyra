// 캐러셀 조립 — 4장 구성과 후크 선별 규칙을 고정한다.
import assert from "node:assert/strict";
import { buildCarousel, autoPick, groupByStanza, hookScore, suggestHooks, stanzaFits, CAROUSEL_SLIDES } from "./carousel.js";

// 최유리 「숲」 — 실제 데이터 형태 그대로
const lines = [
  { en: "난 저기 숲이 돼볼게", ko: "I'll try being that forest over there", section: "", stanza: 0 },
  { en: "너는 자그맣기만 한 언덕 위를", ko: "and you climb the hill that's only small", section: "", stanza: 0 },
  { en: "오르며 날 바라볼래", ko: "and look at me, will you", section: "", stanza: 0 },
  { en: "나의 작은 마음 한구석이어도 돼", ko: "one small corner of my heart is enough", section: "", stanza: 0 },
  { en: "길을 터 보일게 나를 베어도 돼", ko: "I'll open a path for you, you can cut me down", section: "", stanza: 1 },
  { en: "날 지나치지 마 날 보아줘", ko: "Don't pass me by, look at me", section: "", stanza: 1 },
  { en: "나는 널 들을게 이젠 말해도 돼", ko: "I'll listen to you, you can speak now", section: "", stanza: 1 },
];
const NOTE = "자신을 숲이라 했다가 바다가 아니었느냐고 되묻기를 반복한다.";

// 연 나누기 — section 라벨이 없는 연도 stanza 인덱스로 갈린다
{
  const groups = groupByStanza(lines);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].items.length, 4);
  assert.equal(groups[1].items.length, 3);
  assert.equal(groups[1].items[0].index, 4, "원본 배열에서의 위치를 잃지 않는다");
}

// 4장 구성 — 후크 · 여는 연 · 후크가 속한 연 · 노트
{
  const { slides, error } = buildCarousel({ lines, hookIndex: 5, note: NOTE });
  assert.equal(error, "");
  assert.equal(slides.length, CAROUSEL_SLIDES);
  assert.deepEqual(slides.map((s) => s.role), ["hook", "opening", "peak", "cover"]);

  // 1장 — 후크 한 줄, 번역 없이. 뜻은 3장에서 열린다.
  assert.deepEqual(slides[0].lines, [{ en: "날 지나치지 마 날 보아줘", ko: "" }]);

  // 2장 — 후크가 속하지 않은 연
  assert.equal(slides[1].lines.length, 4);
  assert.equal(slides[1].lines[0].en, "난 저기 숲이 돼볼게");
  assert.ok(slides[1].lines[0].ko, "여는 연에는 번역이 붙는다");

  // 3장 — 후크가 속한 연. 1장의 줄이 여기 다시 나오는 것이 설계의 핵심이다.
  assert.equal(slides[2].lines.length, 3);
  assert.ok(
    slides[2].lines.some((l) => l.en === "날 지나치지 마 날 보아줘"),
    "후크는 자기 연 안에서 맥락과 함께 다시 나온다"
  );

  // 4장 — 앨범 커버가 주인공. 전용 렌더러가 그리므로 lines가 아니라 note를 싣는다.
  assert.equal(slides[3].note, NOTE);
  assert.deepEqual(slides[3].lines, [], "가사 줄을 그리지 않는다");
}

// 해설이 없는 곡도 4장이다 — 커버 장은 앨범·곡 정보만으로 성립한다.
// (해설이 없다고 계정의 얼굴이 되는 장을 빼지 않는다)
{
  const { slides } = buildCarousel({ lines, hookIndex: 5, note: "" });
  assert.equal(slides.length, 4);
  assert.equal(slides[3].role, "cover");
  assert.equal(slides[3].note, "");
}

// 자동 선택 — 열자마자 후크가 정해진다. 고를 것을 없애는 것이 요점이다.
{
  const picked = autoPick(lines);
  assert.ok(picked >= 0 && picked < lines.length);
  assert.equal(picked, suggestHooks(lines, 1)[0].index, "최고 점수 줄을 고른다");

  // 후보가 하나도 없는 곡(전부 너무 길다)도 멈추지 않는다
  const longOnly = [{ en: "가".repeat(60), ko: "", stanza: 0 }];
  assert.equal(autoPick(longOnly), 0, "점수를 못 받아도 첫 줄로 시작한다");

  // 빈 줄만 있으면 -1 → buildCarousel이 에러로 받는다
  assert.equal(autoPick([{ en: "   ", ko: "", stanza: 0 }]), -1);
}

// 첫 연에서 후크를 고르면 — 여는 연은 다른 연이 된다
{
  const { slides } = buildCarousel({ lines, hookIndex: 0, note: NOTE });
  assert.equal(slides[1].lines[0].en, "길을 터 보일게 나를 베어도 돼", "후크가 속한 연을 여는 연으로 쓰지 않는다");
  assert.ok(slides[2].lines.some((l) => l.en === "난 저기 숲이 돼볼게"));
}

// 여는 연을 직접 고를 수 있다 — 자동 선택이 늘 맞지는 않는다
{
  const { slides } = buildCarousel({ lines, hookIndex: 0, note: NOTE, openingStanzaIndex: 1 });
  assert.equal(slides[1].lines[0].en, "길을 터 보일게 나를 베어도 돼");
}

// 후크를 안 고르면 에러 — 조용히 빈 카드를 내지 않는다
{
  const { slides, error } = buildCarousel({ lines, hookIndex: -1, note: NOTE });
  assert.equal(slides.length, 0);
  assert.match(error, /후크/);
}

// 후크 점수 — 짧고 1인칭인 발화가 위로 온다
{
  assert.ok(hookScore({ en: "나를 베어도 돼" }) > hookScore({ en: "1999년의 여름밤 매미가 울던" }), "연도가 든 서사는 후크가 아니다");
  assert.equal(hookScore({ en: "" }), 0);
  assert.equal(hookScore({ en: "짧" }), 0, "너무 짧으면 후크가 못 된다");
  assert.equal(hookScore({ en: "가".repeat(40) }), 0, "0.5초에 안 읽히는 길이는 제외");
}

// 제안 목록 — 화면이 먼저 후보를 내민다
{
  const picks = suggestHooks(lines, 3);
  assert.equal(picks.length, 3);
  assert.ok(picks[0].score >= picks[1].score, "점수 순 정렬");
  assert.ok(picks.every((p) => lines[p.index]), "원본 인덱스를 가리킨다");
}

// 긴 연은 카드에 안 들어간다 — 4줄 이하가 전체의 66%
{
  assert.equal(stanzaFits({ items: new Array(4) }), true);
  assert.equal(stanzaFits({ items: new Array(9) }), false);
  assert.equal(stanzaFits({ items: [] }), false);
}

console.log("✓ 캐러셀 — 4장 구성·후크 선별·연 나누기");
