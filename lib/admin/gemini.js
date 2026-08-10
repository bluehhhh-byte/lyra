// Gemini 텍스트 생성 — 관리자 API 전역이 쓰는 공용 헬퍼.

// "-latest" alias, not a pinned version — a hardcoded gemini-2.5-flash died the
// day the API key was reissued ("no longer available to new users"). The alias
// tracks whatever flash is current; env override for the day the alias misbehaves.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

export async function geminiText(key, prompt, json = false) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  });
  // Gemini free tier throws intermittent 503 "high demand" and 429 rate-limit
  // (RPM/RPD) spikes — retry with backoff so a single blip doesn't fail a
  // comment/translation. 429 gets a longer wait (rate windows are seconds, not
  // ms) but stays well under maxDuration; a persistent 429 still gives up so a
  // bulk run doesn't stall on an exhausted daily quota.
  for (let attempt = 0; attempt < 3; attempt++) {
    let rateLimited = false;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } else if (res.status === 429) {
        rateLimited = true;
      } else if (res.status < 500) {
        return ""; // 400/401 etc. — a retry won't help
      }
    } catch {}
    if (attempt < 2) await new Promise((r) => setTimeout(r, (rateLimited ? 5000 : 800) * (attempt + 1)));
  }
  return "";
}
