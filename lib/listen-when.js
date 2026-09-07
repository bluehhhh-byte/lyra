// 커버 카드의 "이런 순간에" 한 줄 — listen_when 프론트매터.
//
// 곡을 어떤 순간에 들으면 좋은지 그리는 장면 한 줄이다. 카드 1장(커버)의
// 메타 줄과 해시태그 사이에 실려, 스쳐 지나가는 사람에게 곡을 걸어 둘
// 갈고리가 된다. 신규 곡은 computeAuto의 Gemini 호출이 만들고, 기존 곡은
// scripts/listen-when-*.mjs 배치가 채웠다.

// Gemini 스키마 줄과 배치 생성이 공유하는 규칙 — 한 곳에서만 정의한다.
export const LISTEN_WHEN_RULE =
  "listenWhen: 이 곡을 듣기 좋은 순간을 그리는 장면 한 줄, 12~22자. 구체적 상황 하나만 담아 '~때'/'~밤'/'~날'/'~길'/'~새벽' 같은 명사형으로 끝내라. 서술어(~다/~요)로 끝내지 말 것. 문장부호·따옴표·해시태그 금지. 가사의 정서에 근거하되 가사 문장을 그대로 옮기지 마라";

// 모델이 붙여 오는 장식을 벗기고, 카드 한 줄에 못 들어갈 길이는 버린다 —
// 한국어를 중간에서 자르면 문장이 깨지므로 자르지 않고 비운다(재생성이 답이다).
export function cleanListenWhen(value) {
  const line = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'「『“‘]+/, "")
    .replace(/[\s"'」』”’.。!?…~]+$/, "")
    .trim();
  if (!line || line.length > 30) return "";
  if (/[\n#]/.test(line)) return "";
  return line;
}
