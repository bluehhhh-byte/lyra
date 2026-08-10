// Gemini 텍스트 생성 — 관리자 API 전역이 쓰는 공용 헬퍼.

// "-latest" alias, not a pinned version — a hardcoded gemini-2.5-flash died the
// day the API key was reissued ("no longer available to new users"). The alias
// tracks whatever flash is current; env override for the day the alias misbehaves.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

// 기계적·대량 작업용(태그·키워드·연 구분·일괄 재생성). flash와 무료 쿼터
// 버킷이 분리돼 있어 58곡 일괄 작업이 본 모델(번역·해설)의 RPM/RPD를 전혀
// 안 갉아먹는다. 품질 민감한 번역·해설·감상은 GEMINI_MODEL을 그대로 쓴다.
export const GEMINI_LITE_MODEL = process.env.GEMINI_MODEL_LITE || "gemini-flash-lite-latest";

export async function geminiText(key, prompt, json = false, model = GEMINI_MODEL) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  });
  // Gemini free tier throws intermittent 503 "high demand" and 429 rate-limit
  // (RPM/RPD) spikes — retry with backoff so a single blip doesn't fail a
  // comment/translation. 429 응답의 RetryInfo(retryDelay)를 읽어 그만큼 기다리되
  // 12초로 캡 — maxDuration 60초 안에서 재시도 여지를 남긴다. a persistent 429
  // still gives up so a bulk run doesn't stall on an exhausted daily quota.
  for (let attempt = 0; attempt < 3; attempt++) {
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
      } else if (res.status === 429) {
        rateLimited = true;
        try {
          const err = await res.json();
          const rd = err?.error?.details?.find((d) => String(d["@type"]).includes("RetryInfo"))?.retryDelay;
          retryAfterMs = Math.min((parseFloat(rd) || 0) * 1000, 12000);
        } catch {}
      } else if (res.status < 500) {
        return ""; // 400/401 etc. — a retry won't help
      }
    } catch {}
    if (attempt < 2)
      await new Promise((r) =>
        setTimeout(r, rateLimited ? retryAfterMs || 5000 * (attempt + 1) : 800 * (attempt + 1))
      );
  }
  return "";
}
