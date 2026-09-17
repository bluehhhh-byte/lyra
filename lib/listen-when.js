// 커버 카드의 "이런 순간에" 한 줄 — listen_when 프론트매터.
//
// 곡을 어떤 순간에 들으면 좋은지 그리는 장면 한 줄이다. 카드 1장(커버)의
// 메타 줄과 해시태그 사이에 실려, 스쳐 지나가는 사람에게 곡을 걸어 둘
// 갈고리가 된다. 신규 곡은 computeAuto의 Gemini 호출이 만들고, 기존 곡은
// scripts/listen-when-*.mjs 배치가 채웠다.

// Gemini 스키마 줄과 배치 생성이 공유하는 규칙 — 한 곳에서만 정의한다.
export const LISTEN_WHEN_RULE =
  "listenWhen: 이 곡을 듣기 좋은 순간을 그리는 장면 한 줄, 12~22자. 구체적 상황 하나만 담아 '~때'/'~밤'/'~날'/'~길'/'~새벽' 같은 명사형으로 끝내라. 서술어(~다/~요)로 끝내지 말 것. 문장부호·따옴표·해시태그 금지. 가사의 정서에 근거하되 가사 문장을 그대로 옮기지 마라";

// ── 발행 시각에 맞춰 시간 낱말 바꾸기 ────────────────────────────────────
//
// listen_when의 60%(987곡 중 591곡)가 시간 낱말로 끝나고, 그중 397곡이 「밤」이다.
// 곡을 등록한 시각에 맞춰 쓰였기 때문인데, 캐러셀은 아무 때나 발행한다. 아침에
// 올린 카드가 「…다짐하는 밤」이라고 말하면 지금 보는 사람의 시간과 어긋난다.
//
// 그래서 발행하는 순간의 시간대로 그 낱말만 바꾼다. 문장의 나머지는 건드리지
// 않는다 — 장면을 다시 쓰는 것이 아니라 시계만 맞추는 일이다.
//
// 저장된 값은 그대로 둔다. 곡 페이지는 기록이고, 바뀌는 것은 카드뿐이다.
export const TIME_WORDS = Object.freeze(["새벽", "아침", "낮", "오후", "저녁", "밤"]);

// 경계는 한국어에서 그 말을 쓰는 대로 잡았다. 0~5시가 새벽이고, 해 뜨면 아침,
// 점심 앞뒤가 낮, 그 뒤가 오후, 해 질 무렵이 저녁, 그다음이 밤이다.
export function timeWordFor(date = new Date()) {
  const hour = Number.isFinite(date) ? new Date(date).getHours() : date.getHours();
  if (hour < 6) return "새벽";
  if (hour < 11) return "아침";
  if (hour < 14) return "낮";
  if (hour < 18) return "오후";
  if (hour < 21) return "저녁";
  return "밤";
}

// 끝 낱말이 통째로 시간 낱말일 때만 바꾼다. 「한밤」·「늦은밤」처럼 붙어 있는
// 경우를 건드리면 「한아침」이 된다 — 앞에 공백이 있어야 독립된 낱말이다.
//
// 「날」·「때」·「순간」·「길」로 끝나는 396곡은 시간대가 아니라 상황이라 그대로 둔다.
export function retimeListenWhen(line, date = new Date()) {
  const text = String(line || "").trim();
  if (!text) return text;
  const want = timeWordFor(date);
  for (const word of TIME_WORDS) {
    if (!text.endsWith(word)) continue;
    const head = text.slice(0, -word.length);
    // 앞이 비었으면 문장 전체가 시간 낱말 하나다 — 바꿀 장면이 없다
    if (!head || !/\s$/.test(head)) continue;
    return word === want ? text : `${head}${want}`;
  }
  return text;
}

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
