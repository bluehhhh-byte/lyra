// Gemini 텍스트 생성 — 관리자 API 전역이 쓰는 공용 헬퍼.

// "-latest" alias, not a pinned version — a hardcoded gemini-2.5-flash died the
// day the API key was reissued ("no longer available to new users"). The alias
// tracks whatever flash is current; env override for the day the alias misbehaves.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

// 기계적·대량 작업용(태그·키워드·연 구분·일괄 재생성). flash와 무료 쿼터
// 버킷이 분리돼 있어 58곡 일괄 작업이 본 모델(번역·해설)의 RPM/RPD를 전혀
// 안 갉아먹는다. 품질 민감한 번역·해설·감상은 GEMINI_MODEL을 그대로 쓴다.
export const GEMINI_LITE_MODEL = process.env.GEMINI_MODEL_LITE || "gemini-flash-lite-latest";

// 같은 순간에도 모델마다 여유가 다르다. 2026-08-19에 gemini-flash-latest가 가리키던
// 최신 flash가 온종일 503 UNAVAILABLE("high demand")을 뱉는 동안 한 세대 아래 모델과
// lite는 멀쩡히 200을 줬다. 재시도만으로는 못 넘는다 — 모델 전체가 막힌 것이라
// 몇 번을 더 걸어도 같은 문 앞이다. 그래서 내려갈 자리를 만든다.
//
// 별칭을 첫 번째로 두는 것은 그대로다(버전을 박으면 그 버전이 사라지는 날 죽는다).
// 대신 별칭이 막히면 다음 후보로 넘어간다. 후보는 env로 갈아끼울 수 있다.
const FALLBACK_MODELS = (process.env.GEMINI_MODEL_FALLBACKS || "gemini-3.6-flash,gemini-flash-lite-latest")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
  const tried = new Set();
  for (const m of [model, ...FALLBACK_MODELS]) {
    if (tried.has(m)) continue;
    tried.add(m);
    const text = await callModel(key, prompt, json, m);
    if (text) return text;
  }
  return "";
}

async function callModel(key, prompt, json, model) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  });
  // Gemini free tier throws intermittent 503 "high demand" and 429 rate-limit
  // (RPM/RPD) spikes — retry with backoff so a single blip doesn't fail a
  // comment/translation. 429 응답의 RetryInfo(retryDelay)를 읽어 그만큼 기다리되
  // 12초로 캡 — maxDuration 60초 안에서 재시도 여지를 남긴다. a persistent 429
  // still gives up so a bulk run doesn't stall on an exhausted daily quota.
  //
  // 5xx는 두 번만 걸어 보고 다음 모델로 넘긴다. 모델 하나가 통째로 과부하면
  // 세 번째 시도도 같은 문 앞이고, 그 시간은 멀쩡한 모델에 쓰는 편이 낫다.
  let overloaded = false;
  for (let attempt = 0; attempt < 3 && !(overloaded && attempt >= 2); attempt++) {
    let rateLimited = false;
    let retryAfterMs = 0;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body }
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
          retryAfterMs = Math.min((parseFloat(rd) || 0) * 1000, 12000);
        } catch {}
      } else if (res.status < 500) {
        lastGeminiError = await reasonOf(res, model);
        return ""; // 400/401 etc. — a retry won't help
      } else {
        overloaded = true;
        lastGeminiError = await reasonOf(res, model);
      }
    } catch (e) {
      lastGeminiError = `${model}: ${e?.message || e}`;
    }
    if (attempt < (overloaded ? 1 : 2))
      await new Promise((r) =>
        setTimeout(r, rateLimited ? retryAfterMs || 5000 * (attempt + 1) : 800 * (attempt + 1))
      );
  }
  return "";
}
