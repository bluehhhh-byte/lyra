import assert from "node:assert/strict";
import fs from "node:fs";

// 연의 우측 상단 버튼(캐러셀·복사)과 가사가 겹치던 문제의 계약.
//
// 실측으로 배운 것: 복사를 캐러셀 밑으로 내리는 것만으로는 겹침이 줄지 않는다
// (330px 열에서 8건 → 10건으로 오히려 늘었다). 버튼이 absolute라 글 흐름에서
// 빠져 있는 게 원인이고, 연에 자리를 예약해야 사라진다. 쌓기는 그 예약 폭을
// 96px에서 48px로 줄여 주는 역할이다 — 둘이 함께여야 뜻이 있다.
const view = fs.readFileSync(new URL("../app/songs/[slug]/lyrics-view.js", import.meta.url), "utf8");

const stanzaClass = view.match(/group\/stanza reveal relative scroll-mt-24 ([^`]*)/)?.[1] || "";
assert.match(stanzaClass, /\bpr-12\b/, "연은 우측 버튼 자리를 예약해야 한다 — 없으면 긴 줄이 버튼 밑을 지나간다");

const copyButton = view.match(/aria-label="이 구절을 출처와 함께 복사"[\s\S]{0,400}?className="([^"]*)"/)?.[1] || "";
assert.match(copyButton, /\btop-9\b/, "복사는 캐러셀 버튼 아래에 놓인다");
assert.match(copyButton, /\bright-0\b/, "복사와 캐러셀은 같은 오른쪽 모서리에 정렬돼 한 줄로 쌓인다");
assert.doesNotMatch(copyButton, /\bright-11\b/, "나란히 두면 우측 상단 폭이 두 배가 되어 첫 줄과 겹친다");

const carouselButton = view.match(/aria-label="이 구절로 인스타그램 캐러셀 만들기"[\s\S]{0,400}?className="([^"]*)"/)?.[1] || "";
assert.match(carouselButton, /-top-3/, "캐러셀은 스택의 위쪽");
assert.match(carouselButton, /\bright-0\b/, "캐러셀도 같은 오른쪽 모서리");

// 버튼은 44px(h-11/w-11)이고 예약은 48px(pr-12)이라 4px이 남는다.
// 예약을 버튼보다 좁히면 계약이 깨지므로 두 값을 함께 확인한다.
assert.match(carouselButton, /h-11 w-11/, "터치 타겟 44px는 유지한다");

console.log("stanza actions contract passed");
