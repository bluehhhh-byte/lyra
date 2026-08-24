import { geminiText } from "./gemini.js";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const cleanList = (value) => (Array.isArray(value) ? value : []).map(clean).filter(Boolean);
const GENERIC_ONLY = /^(인물의 선택|장면의 분위기|이야기의 흐름|연출과 장르|주제를 생각|감정선을 따라|몰입해서|주목해|살펴보)/;
const TOKEN_STOP = new Set(["영화", "작품", "감독", "배우", "연출", "장면", "이야기", "그리고", "하지만", "통해", "대한", "에서", "으로"]);

function sourceText(movie) {
  return [
    `제목: ${movie.title_ko || movie.title || ""}`,
    `감독: ${movie.director_ko || movie.director || ""}`,
    `출연: ${movie.cast || ""}`,
    `연도/장르/러닝타임: ${movie.year || ""} / ${movie.genre || ""} / ${movie.runtime || ""}분`,
    `태그: ${(movie.tags || []).join(", ")}`,
    `주제: ${(movie.themes || []).join(", ")}`,
    `사용자 별점: ${movie.rating ?? "없음"}/5`,
    `저장된 작품 노트: ${clean(movie.comment) || "없음"}`,
    `줄거리 근거: ${(Array.isArray(movie.synopsis) ? movie.synopsis : [movie.synopsis]).map(clean).filter(Boolean).join(" ") || "없음"}`,
  ].join("\n");
}

export function buildMovieCarouselPrompt(movie) {
  return `너는 영화 홍보 카피라이터가 아니라, 개인 영화 아카이브 Cyno의 편집자다. 아래 자료만 근거로 Instagram 5장 캐러셀 문구를 한국어로 작성하라.

편집 원칙:
- 자료에 없는 인물, 사건, 장면, 촬영기법, 음악 정보를 만들지 마라.
- "감정선을 따라가 보자", "연출에 주목하자", "깊은 여운" 같은 어느 영화에나 붙는 표현만으로 항목을 채우지 마라.
- 각 항목에는 인물명, 구체적 갈등·상황, 감독명, 배우명, 저장된 주제 중 적어도 하나를 넣어 이 작품만의 문장으로 만들어라.
- 결말과 반전은 밝히지 말고, 사실과 개인 감상을 구분하라.
- 문장은 담백한 '~다'체로 쓰고 과장된 추천·홍보 문구를 피하라.

필드 계약:
1) basicDescription: 2~3문장. 작품의 정체성과 독특한 전제를 설명한다. 70~230자.
2) synopsis: 3~5문장. 주인공/상황, 발단, 중심 갈등을 구체적으로 요약한다. 결말 제외. 140~480자.
3) keyPoints: 정확히 3개. 각 30~150자. 순서대로 서사 구조 또는 시점, 중심 갈등, 핵심 주제를 근거와 함께 설명한다.
4) viewingPoints: 정확히 3개. 각 30~150자. 연출 방식, 배우/인물 표현, 이미지·공간·리듬 중 자료로 확인 가능한 관찰과 그것이 만드는 효과를 함께 쓴다. 확인할 수 없는 촬영·음악 정보는 쓰지 않는다.
5) closingNote: 2~3문장. 저장된 작품 노트의 관점을 살리되 그대로 반복하지 않고, 이 영화가 남기는 질문이나 감정을 구체적으로 정리한다. 70~260자.

근거 자료:
${sourceText(movie).slice(0, 5000)}

순수 JSON만 출력:
{"basicDescription":"...","synopsis":"...","keyPoints":["...","...","..."],"viewingPoints":["...","...","..."],"closingNote":"..."}`;
}

function lengthIn(value, min, max) {
  return value.length >= min && value.length <= max;
}

function grounded(text, movie) {
  if (!movie) return true;
  const tokens = sourceText(movie)
    .toLocaleLowerCase("ko")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && !TOKEN_STOP.has(token));
  const output = text.toLocaleLowerCase("ko");
  return tokens.some((token) => output.includes(token));
}

export function parseMovieCarouselCopy(raw, movie = null) {
  let value;
  try {
    value = typeof raw === "string" ? JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim()) : raw;
  } catch {
    return null;
  }
  const copy = {
    basicDescription: clean(value?.basicDescription),
    synopsis: clean(value?.synopsis),
    keyPoints: cleanList(value?.keyPoints),
    viewingPoints: cleanList(value?.viewingPoints),
    closingNote: clean(value?.closingNote),
  };
  if (!lengthIn(copy.basicDescription, 40, 280) || !lengthIn(copy.synopsis, 80, 600) || !lengthIn(copy.closingNote, 40, 320)) return null;
  if (copy.keyPoints.length !== 3 || copy.viewingPoints.length !== 3) return null;
  const points = [...copy.keyPoints, ...copy.viewingPoints];
  if (points.some((point) => !lengthIn(point, 24, 190) || GENERIC_ONLY.test(point))) return null;
  if (new Set(points).size !== points.length) return null;
  if ([copy.basicDescription, copy.synopsis, copy.closingNote, ...points].some((text) => !grounded(text, movie))) return null;
  return copy;
}

export async function movieCarouselCopyGen({ key, movie }) {
  if (!key) return null;
  const raw = await geminiText(key, buildMovieCarouselPrompt(movie), true);
  return parseMovieCarouselCopy(raw, movie);
}
