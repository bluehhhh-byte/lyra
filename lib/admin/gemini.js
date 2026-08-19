// Gemini 텍스트 생성 — 관리자 API 전역이 쓰는 공용 헬퍼.

// "-latest" alias, not a pinned version — a hardcoded gemini-2.5-flash died the
// day the API key was reissued ("no longer available to new users"). The alias
// tracks whatever flash is current; env override for the day the alias misbehaves.
//
// 특정 버전을 고정하자는 제안이 두 번 있었지만 측정이 반대한다. 2026-08-19 하루
// 안에서만 아침에는 latest가 503이고 3.6-flash가 200이었는데, 오후에는 latest가
// 503인 채 3.6-flash가 아예 무응답으로 매달렸다. 어느 쪽을 박아도 반나절 뒤에
// 틀린다. 별칭 + 대체 사슬 + 시간 예산이 유일하게 양쪽에서 사는 구성이다.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

// 기계적·대량 작업용(태그·키워드·연 구분·일괄 재생성). flash와 무료 쿼터
// 버킷이 분리돼 있어 58곡 일괄 작업이 본 모델(번역·해설)의 RPM/RPD를 전혀
// 안 갉아먹는다. 품질 민감한 번역·해설·감상은 GEMINI_MODEL을 그대로 쓴다.
export const GEMINI_LITE_MODEL = process.env.GEMINI_MODEL_LITE || "gemini-flash-lite-latest";

// 같은 순간에도 모델마다 여유가 다르다. 별칭이 막히면 이 순서로 내려간다.
// 3.6-flash는 목록에서 뺐다 — 2026-08-19 오후에 15초 넘게 무응답으로 매달렸다.
// 사슬은 "지금 살아 있는 쪽"으로 고르고, 상황이 바뀌면 env로 갈아끼운다.
const FALLBACK_MODELS = (process.env.GEMINI_MODEL_FALLBACKS || "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-flash-lite-latest")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// 한 요청이 이 시간을 넘기면 끊는다. 과부하 모델은 503을 돌려주기도 하지만
// 그냥 매달리기도 한다 — 매달린 연결 하나가 함수의 maxDuration 60초를 통째로
// 태우면, 대체 모델은 시도도 못 해 보고 Vercel이 함수를 죽인다.
const REQUEST_TIMEOUT_MS = 12_000;

// 대체 사슬 전체의 시간 예산. Vercel이 60초에 함수를 강제 종료하면 호출부는
// 빈 응답조차 못 돌려준다. 우리가 먼저 포기해야 실패 이유라도 화면에 남는다.
const TOTAL_BUDGET_MS = 48_000;

// 마지막 실패 이유 — 빈 문자열만 돌려주면 호출부가 "왜"를 말할 수 없다.
// 곡 등록이 조용히 실패했을 때 사람이 붙잡을 실마리가 이것뿐이다.
export let lastGeminiError = "";

// 실패 메시지에 마지막 원인을 붙인다. 원인이 없으면 그대로 둔다 —
// Gemini와 무관한 502에 남의 오류를 갖다 붙이지 않기 위해 매 호출마다 비운다.
export const withReason = (message) => (lastGeminiError ? `${message} — ${lastGeminiError}` : message);

// 오류 본문에서 사람이 읽을 한 줄만 꺼낸다. 원문 JSON을 그대로 화면에 흘리면
// 길기만 하고 정작 "왜"가 묻힌다.
async function reasonOf(res, model) {
  const body = await res.text().catch(() => "");
  let detail = body;
  try {
    detail = JSON.parse(body)?.error?.message || body;
  } catch {}
  return `${model}: ${res.status} ${String(detail).replace(/\s+/g, " ").trim()}`.slice(0, 160);
}

export async function geminiText(key, prompt, json = false, model = GEMINI_MODEL) {
  lastGeminiError = "";
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const tried = new Set();
  for (const m of [model, ...FALLBACK_MODELS]) {
    if (tried.has(m)) continue;
    tried.add(m);
    if (Date.now() >= deadline) break;
    const text = await callModel(key, prompt, json, m, deadline);
    if (text) return text;
  }
  return "";
}

async function callModel(key, prompt, json, model, deadline) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  });
  // 모델당 최대 2회(재시도 1회). 재시도가 살리는 것은 일시적인 429·네트워크
  // 딸꾹질뿐이다. 5xx는 모델 전체가 막힌 것이라 즉시 다음 모델로 넘어간다 —
  // 그 시간은 살아 있는 모델에 쓰는 편이 낫다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) return "";
    let rateLimited = false;
    let retryAfterMs = 0;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
        lastGeminiError = `${model}: 빈 응답`;
      } else if (res.status === 429) {
        rateLimited = true;
        lastGeminiError = `${model}: 429 할당량 초과`;
        try {
          const err = await res.json();
          const rd = err?.error?.details?.find((d) => String(d["@type"]).includes("RetryInfo"))?.retryDelay;
          retryAfterMs = Math.min((parseFloat(rd) || 0) * 1000, REQUEST_TIMEOUT_MS);
        } catch {}
      } else if (res.status < 500) {
        lastGeminiError = await reasonOf(res, model);
        return ""; // 400/401 etc. — a retry won't help
      } else {
        lastGeminiError = await reasonOf(res, model);
        return ""; // 5xx — 모델 전체가 막혔다. 재시도 대신 다음 모델.
      }
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") {
        // 무응답은 일시적 딸꾹질이 아니라 모델 전체가 매달린 것이다 — 같은 모델을
        // 다시 두드리면 12초를 또 태운다. 즉시 다음 모델로 넘어간다.
        lastGeminiError = `${model}: ${Math.round(REQUEST_TIMEOUT_MS / 1000)}초 무응답`;
        return "";
      }
      lastGeminiError = `${model}: ${e?.message || e}`;
    }
    if (attempt < 1) {
      // 기다림도 예산에서 나간다 — 마감 직전이면 기다리지 않고 다음 모델로.
      const wait = Math.min(rateLimited ? retryAfterMs || 4000 : 1000, deadline - Date.now() - 1000);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }
  return "";
}
