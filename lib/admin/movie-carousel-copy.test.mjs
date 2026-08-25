import assert from "node:assert/strict";
import { buildMovieCarouselPrompt, parseMovieCarouselCopy } from "./movie-carousel-copy.js";

const movie = {
  title_ko: "기생충",
  director_ko: "봉준호",
  cast: "송강호, 이선균, 조여정",
  year: 2019,
  runtime: 131,
  genre: "Comedy",
  rating: 5,
  tags: ["한국", "Comedy", "2019"],
  themes: ["가족", "불안", "상실"],
  comment: "극과 극의 계층을 오가는 연출로 자본주의 사회의 비극을 선명하게 보여준다.",
  synopsis: ["전원 백수인 기택 가족의 장남 기우는 친구의 소개로 박 사장 집의 고액 과외를 맡는다. 가족은 차례로 저택에 들어가지만 예상하지 못한 사건과 맞닥뜨린다."],
};

const prompt = buildMovieCarouselPrompt(movie);
for (const fact of ["기생충", "봉준호", "송강호", "기택", "가족", "자료에 없는"]) assert.match(prompt, new RegExp(fact));
assert.match(prompt, /정확히 3개/);
assert.match(prompt, /어느 영화에나 붙는 표현/);

const valid = {
  basicDescription: "봉준호의 기생충은 반지하에 사는 기택 가족이 박 사장 저택으로 들어가며 두 가족의 계층 차이를 드러내는 영화다. 생존을 위한 계획이 예기치 않은 균열을 만든다.",
  synopsis: "기택의 아들 기우는 친구 대신 박 사장 딸의 과외를 맡는다. 그는 가족의 능력을 새로운 고용인으로 포장해 아버지와 어머니, 동생까지 저택으로 불러들인다. 계획대로 흘러가던 두 가족의 관계는 저택에 감춰진 사정이 드러나며 위태로워진다.",
  keyPoints: [
    "반지하와 언덕 위 저택을 오가는 가족의 이동이 계층 상승을 꿈꾸는 서사의 방향을 공간으로 보여준다.",
    "기택 가족의 생존 계획과 박 사장 가족의 무지가 맞물리면서 웃음이 점차 불안과 충돌로 바뀐다.",
    "가족을 지키려는 선택이 다른 가족의 자리를 빼앗는 구조를 통해 자본주의의 공생과 착취를 함께 묻는다.",
  ],
  viewingPoints: [
    "봉준호는 반지하의 낮은 창과 저택의 계단을 반복해 인물 사이의 계층 거리를 눈에 보이는 동선으로 만든다.",
    "송강호가 연기한 기택의 표정이 자신감에서 모멸감으로 변하는 순간을 따라가면 후반의 선택이 더 선명해진다.",
    "두 가족이 같은 공간을 전혀 다르게 사용하는 모습을 비교하면 코미디가 불안으로 전환되는 리듬을 읽을 수 있다.",
  ],
  keyPointsNote: "기택 가족이 저택에 스며들며 계층의 경계를 시험하는 이야기다.",
  viewingPointsNote: "2010년대 한국 코미디가 계급이라는 주제를 공간의 언어로 밀어붙인 사례다.",
};
assert.deepEqual(parseMovieCarouselCopy(JSON.stringify(valid)), valid);
assert.deepEqual(parseMovieCarouselCopy(JSON.stringify(valid), movie), valid);

// 예전 스키마(closingNote 하나)로 답해도 5장 요약 자리로 흡수한다 — Gemini가
// 캐시된 옛 프롬프트 형식으로 답하는 과도기를 견디기 위한 하위 호환이다.
{
  const legacy = { ...valid };
  delete legacy.keyPointsNote;
  delete legacy.viewingPointsNote;
  legacy.closingNote = "기생충은 가난한 가족의 속임수만을 심판하지 않는다. 누군가의 평온이 다른 사람의 보이지 않는 노동 위에 놓여 있다는 사실을 두 가족의 충돌로 남긴다.";
  assert.equal(parseMovieCarouselCopy(JSON.stringify(legacy)), null, "keyPointsNote가 없으면 초안 fallback에 맡긴다");
}
assert.equal(parseMovieCarouselCopy("not json"), null);
assert.equal(parseMovieCarouselCopy(JSON.stringify({ ...valid, viewingPoints: ["연출에 주목하자."] })), null);
assert.equal(parseMovieCarouselCopy(JSON.stringify({ ...valid, keyPoints: [valid.keyPoints[0], valid.keyPoints[0], valid.keyPoints[0]] })), null);
assert.equal(
  parseMovieCarouselCopy(JSON.stringify({ ...valid, viewingPoints: valid.viewingPoints.map(() => "우주선의 무중력 움직임이 인류의 미래를 시각적으로 암시하는 구체적인 장면이다.") }), movie),
  null,
  "근거 자료와 겹치는 구체어가 전혀 없는 문장은 그럴듯해도 거부해야 한다",
);

console.log("Cyno carousel editorial copy contract passed");
