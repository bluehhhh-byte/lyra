// Jev(TypeSafe AI, Vercel AI Gateway) 상투구 검사 — comment 생성 뒤에 붙는
// 선택적 품질 게이트. 2026-09-15 출시, 무료는 프로모션 기간(2026-09-25까지,
// vercel.com/ai-gateway/models/typesafe-ai/jev 표기)뿐이다. 그 뒤로는 가격이
// 바뀌거나 계정에 요금이 붙을 수 있으므로, 이 모듈은 실패를 "예외"로 다루지
// 않는다 — 키가 없든, 402/403(카드·쿼터)이든, 타임아웃이든, 무엇이 됐든
// null을 돌려준다. 호출부(song-meta.js)는 null을 받으면 게이트 없이 원래
// 코멘트를 그대로 쓴다. 이 모듈이 통째로 죽어도(예: 프로모션 종료로 402가
// 고정되는 경우) 곡 등록·재생성 파이프라인은 절대 영향받지 않는다.

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/evaluate";
const TIMEOUT_MS = 6_000;

// 상투적 감성 어휘("그립다/애절하다/쓸쓸하다/먹먹하다" 류)에 기대는 정도를
// 0~1 확률로 묻는다. 이 값 이상일 때만 재작성을 시도한다 — 매번 재작성을
// 걸면 Gemini 호출이 두 배로 늘어 무료 쿼터를 반나절 만에 태운다.
export const CLICHE_THRESHOLD = 0.7;

// comment 한 줄을 Jev에 보여 상투구 확률을 받는다. 실패하면 항상 null —
// 호출부가 "게이트를 못 돌렸다"와 "상투적이지 않다(false)"를 구분할 수 있게
// 한다(null이면 건너뛰고, 숫자면 임계값과 비교한다).
export async function checkCliche(comment) {
  const key = process.env.AI_GATEWAY_API_KEY;
  const text = String(comment || "").trim();
  if (!key || !text) return null;
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "typesafe-ai/jev",
        state: text,
        questions: {
          cliche: {
            type: "boolean",
            instructions:
              '이 코멘트가 "그립다/애절하다/쓸쓸하다/먹먹하다" 같은 상투적 감성 어휘에 기대는 대신, ' +
              "곡의 구체적 이미지·상황·정서로 쓰였는지 평가하라. 상투구에 기댈수록 true에 가깝다.",
          },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null; // 402(카드/쿼터)·403·429 등 — 프로모션 종료 후 흔해질 경로
    const data = await res.json();
    const p = data?.answers?.cliche?.probability;
    return typeof p === "number" && p >= 0 && p <= 1 ? p : null;
  } catch {
    return null; // 타임아웃·네트워크 오류 — 게이트 없이 진행
  }
}
