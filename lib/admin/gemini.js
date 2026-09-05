// Gemini 텍스트 생성 — 관리자 API 전역이 쓰는 공용 헬퍼.

// "-latest" alias, not a pinned version — a hardcoded gemini-2.5-flash died the
// day the API key was reissued ("no longer available to new users"). The alias
// tracks whatever flash is current; env override for the day the alias misbehaves.
//
// 특정 버전을 고정하자는 제안이 두 번 있었지만 측정이 반대한다. 2026-08-19 하루
// 안에서만 아침에는 latest가 503이고 3.6-flash가 200이었는데, 오후에는 latest가
// 503인 채 3.6-flash가 아예 무응답으로 매달렸다. 어느 쪽을 박아도 반나절 뒤에
// 틀린다. 별칭 + 대체 사슬 + 시간 예산이 유일하게 양쪽에서 사는 구성이다.
const clean = (value) =>
  String(value ?? "").replace(/^\uFEFF/, "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();

export const GEMINI_MODEL = clean(process.env.GEMINI_MODEL) || "gemini-flash-latest";

// 기계적·대량 작업용(태그·키워드·연 구분·일괄 재생성). flash와 무료 쿼터
// 버킷이 분리돼 있어 58곡 일괄 작업이 본 모델(번역·해설)의 RPM/RPD를 전혀
// 안 갉아먹는다. 품질 민감한 번역·해설·감상은 GEMINI_MODEL을 그대로 쓴다.
export const GEMINI_LITE_MODEL = clean(process.env.GEMINI_MODEL_LITE) || "gemini-flash-lite-latest";

// 같은 순간에도 모델마다 여유가 다르다. 별칭이 막히면 이 순서로 내려간다.
// 3.6-flash는 목록에서 뺐다 — 2026-08-19 오후에 15초 넘게 무응답으로 매달렸다.
// 사슬은 "지금 살아 있는 쪽"으로 고르고, 상황이 바뀌면 env로 갈아끼운다.
const FALLBACK_MODELS = (process.env.GEMINI_MODEL_FALLBACKS || "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-flash-lite-latest")
  .split(",")
  .map(clean)
  .filter(Boolean);

// 한 요청이 이 시간을 넘기면 끊는다. 과부하 모델은 503을 돌려주기도 하지만
// 그냥 매달리기도 한다 — 매달린 연결 하나가 함수의 maxDuration 60초를 통째로
// 태우면, 대체 모델은 시도도 못 해 보고 Vercel이 함수를 죽인다.
const REQUEST_TIMEOUT_MS = 12_000;

// 대체 사슬 전체의 시간 예산. Vercel이 함수를 강제 종료하면 호출부는
// 빈 응답조차 못 돌려준다. 우리가 먼저 포기해야 실패 이유라도 화면에 남는다.
const TOTAL_BUDGET_MS = 48_000;

// 장문 산문(취향 리포트)용 예산. 12초는 번역 한 줄·JSON 한 덩어리 기준이라,
// 3~4문단을 요구하면 좋은 모델일수록 그 안에 못 끝내고 매번 잘린다. 실측에서
// gemini-flash-latest와 gemini-3.5-flash가 나란히 12.0초에 끊기고 lite 모델만
// 살아남았다 — 사슬이 품질 좋은 모델을 구조적으로 버리고 있었다.
// 재시도 정책은 그대로다(5xx·무응답은 다음 모델로). 늘린 것은 기다리는 시간뿐.
// /api/admin의 maxDuration은 180초라 이 예산은 그 안에 넉넉히 들어간다.
export const LONG_FORM_TIMEOUT_MS = 40_000;
const LONG_FORM_BUDGET_MS = 150_000;

// 마지막 실패 이유 — 빈 문자열만 돌려주면 호출부가 "왜"를 말할 수 없다.
// 곡 등록이 조용히 실패했을 때 사람이 붙잡을 실마리가 이것뿐이다.
export let lastGeminiError = "";
export let lastGeminiRetryAfterMs = 0;

// 실패 메시지에 마지막 원인을 붙인다. 원인이 없으면 그대로 둔다 —
// Gemini와 무관한 502에 남의 오류를 갖다 붙이지 않기 위해 매 호출마다 비운다.
export const withReason = (message) => (lastGeminiError ? `${message} — ${lastGeminiError}` : message);

// Vercel 로그에서 모델 상태를 시간순으로 찾기 위한 구조화 기록. 키와 프롬프트는
// 절대 넣지 않는다. 이 함수는 관측만 하며 아래 재시도·대체 모델 분기에 관여하지 않는다.
export function recordGeminiCall({ model, startedAt, outcome, attempt = 1, status = 0, reason = "" }, logger = console.info) {
  const at = new Date(startedAt).toISOString();
  const entry = {
    level: outcome === "success" ? "info" : "warn",
    msg: "gemini_call",
    model: String(model || "unknown"),
    at,
    durationMs: Math.max(0, Date.now() - startedAt),
    attempt,
    outcome,
    ...(status ? { status } : {}),
    ...(reason ? { reason: String(reason).slice(0, 160) } : {}),
  };
  logger(JSON.stringify(entry));
  return entry;
}

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

export async function geminiText(key, prompt, json = false, model = GEMINI_MODEL, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  lastGeminiError = "";
  const apiKey = clean(key);
  if (!apiKey) {
    lastGeminiError = "GEMINI_API_KEY가 비었습니다";
    recordGeminiCall({ model, startedAt: Date.now(), outcome: "failure", reason: lastGeminiError });
    return "";
  }
  const budget = timeoutMs > REQUEST_TIMEOUT_MS ? LONG_FORM_BUDGET_MS : TOTAL_BUDGET_MS;
  const deadline = Date.now() + budget;
  const tried = new Set();
  for (const m of [model, ...FALLBACK_MODELS]) {
    if (tried.has(m)) continue;
    tried.add(m);
    if (Date.now() >= deadline) break;
    const text = await callModel(apiKey, prompt, json, clean(m), deadline, { timeoutMs });
    if (text) return text;
  }
  return "";
}

// 사실 확인이 필요한 관리자 기능용. Gemini의 Google Search grounding을 켜고,
// 답을 실제로 뒷받침한 웹 출처만 함께 돌려준다. 검색 결과가 없으면 호출부는
// 추측값을 쓰지 않고 빈칸을 유지한다.
// 그라운딩 429는 모델이 아니라 계정의 검색 한도가 소진된 것이다. 2026-09-05에
// 같은 키로 확인했다 — google_search를 켠 요청은 모든 모델에서 429였고, 끈 요청은
// 같은 모델에서 200이었다. 그러므로 대체 모델을 도는 것은 남은 한도를 더 태우고
// 50초를 버리는 일일 뿐이라, 429를 만나면 바로 멈춘다.
export async function geminiGrounded(key, prompt, model = GEMINI_MODEL, {
  beforeAttempt,
  stopOnRateLimit = true,
} = {}) {
  lastGeminiError = "";
  lastGeminiRetryAfterMs = 0;
  const apiKey = clean(key);
  if (!apiKey) {
    lastGeminiError = "GEMINI_API_KEY가 비었습니다";
    recordGeminiCall({ model, startedAt: Date.now(), outcome: "failure", reason: lastGeminiError });
    return null;
  }
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const tried = new Set();
  for (const m of [model, ...FALLBACK_MODELS]) {
    if (tried.has(m)) continue;
    tried.add(m);
    if (Date.now() >= deadline) break;
    const result = await callModel(apiKey, prompt, false, clean(m), deadline, {
      grounded: true,
      beforeAttempt,
      stopOnRateLimit,
    });
    if (result === RATE_LIMITED) return null;
    if (result) return result;
  }
  return null;
}

const RATE_LIMITED = Symbol("gemini-rate-limited");

async function callModel(key, prompt, json, model, deadline, {
  grounded = false,
  timeoutMs = REQUEST_TIMEOUT_MS,
  beforeAttempt,
  stopOnRateLimit = false,
} = {}) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
    ...(grounded ? { tools: [{ google_search: {} }] } : {}),
  });
  // 모델당 최대 2회(재시도 1회). 재시도가 살리는 것은 일시적인 429·네트워크
  // 딸꾹질뿐이다. 5xx는 모델 전체가 막힌 것이라 즉시 다음 모델로 넘어간다 —
  // 그 시간은 살아 있는 모델에 쓰는 편이 낫다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const startedAt = Date.now();
    const record = (outcome, fields = {}) =>
      recordGeminiCall({ model, startedAt, outcome, attempt: attempt + 1, ...fields });
    const remaining = deadline - Date.now();
    if (remaining <= 500) return "";
    // The callback sits immediately before fetch so shared quotas count actual
    // network attempts, including same-model retries and fallback models.
    if (beforeAttempt) await beforeAttempt({ model, attempt: attempt + 1, grounded });
    let rateLimited = false;
    let retryAfterMs = 0;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          record("success", { status: res.status });
          if (!grounded) return text;
          const metadata = data.candidates?.[0]?.groundingMetadata || {};
          const chunks = metadata.groundingChunks || [];
          const supported = new Set(
            (metadata.groundingSupports || []).flatMap((support) => support.groundingChunkIndices || [])
          );
          const sources = [...supported]
            .map((index) => chunks[index]?.web)
            .filter((web) => web?.uri)
            .map((web) => ({ uri: String(web.uri), title: String(web.title || "웹 검색 결과") }));
          return {
            text,
            sources,
            queries: (metadata.webSearchQueries || []).map(String),
            searchEntryPoint: String(metadata.searchEntryPoint?.renderedContent || ""),
          };
        }
        lastGeminiError = `${model}: 빈 응답`;
        record("failure", { status: res.status, reason: lastGeminiError });
      } else if (res.status === 429) {
        rateLimited = true;
        // 모델 이름만 적으면 "이 모델이 막혔다"로 읽혀 다른 모델을 시도하게 만든다.
        // 그라운딩 한도는 계정 단위라 모델을 바꿔도 같다 — 그 사실을 문구에 담는다.
        lastGeminiError = grounded
          ? "Google 검색 그라운딩 한도 소진 — 모델을 바꿔도 같습니다. 한도가 초기화된 뒤 다시 시도하세요."
          : `${model}: 429 할당량 초과`;
        record("failure", { status: res.status, reason: lastGeminiError });
        try {
          const err = await res.json();
          const rd = err?.error?.details?.find((d) => String(d["@type"]).includes("RetryInfo"))?.retryDelay;
          retryAfterMs = Math.min((parseFloat(rd) || 0) * 1000, REQUEST_TIMEOUT_MS);
          lastGeminiRetryAfterMs = retryAfterMs;
        } catch {}
        if (stopOnRateLimit) return RATE_LIMITED;
      } else if (res.status < 500) {
        lastGeminiError = await reasonOf(res, model);
        record("failure", { status: res.status, reason: lastGeminiError });
        return ""; // 400/401 etc. — a retry won't help
      } else {
        lastGeminiError = await reasonOf(res, model);
        record("failure", { status: res.status, reason: lastGeminiError });
        return ""; // 5xx — 모델 전체가 막혔다. 재시도 대신 다음 모델.
      }
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") {
        // 무응답은 일시적 딸꾹질이 아니라 모델 전체가 매달린 것이다 — 같은 모델을
        // 다시 두드리면 12초를 또 태운다. 즉시 다음 모델로 넘어간다.
        lastGeminiError = `${model}: ${Math.round(timeoutMs / 1000)}초 무응답`;
        record("failure", { reason: lastGeminiError });
        return "";
      }
      lastGeminiError = `${model}: ${e?.message || e}`;
      record("failure", { reason: lastGeminiError });
    }
    if (attempt < 1) {
      // 기다림도 예산에서 나간다 — 마감 직전이면 기다리지 않고 다음 모델로.
      const wait = Math.min(rateLimited ? retryAfterMs || 4000 : 1000, deadline - Date.now() - 1000);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }
  return "";
}
