import assert from "node:assert/strict";
import { geminiText, withReason, GEMINI_MODEL } from "./admin/gemini.js";

const modelOf = (url) => String(url).match(/models\/([^:]+):/)[1];

const withFetch = async (impl, run) => {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(modelOf(url));
    return impl(modelOf(url), url, init);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = real;
  }
};

const ok = (text) => Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
const overloaded = () =>
  Response.json({ error: { code: 503, message: "high demand", status: "UNAVAILABLE" } }, { status: 503 });

// 모델 하나가 통째로 막히면 다음 모델로 내려간다.
// 2026-08-19에 gemini-flash-latest가 온종일 503이었고, 재시도만 하던 코드는
// 빈 문자열만 돌려줘 곡 등록이 이유 없이 실패했다.
{
  const out = await withFetch(
    (model) => (model === GEMINI_MODEL ? overloaded() : ok("살아 있는 모델의 답")),
    async (calls) => {
      const text = await geminiText("k", "prompt");
      assert.equal(text, "살아 있는 모델의 답", "과부하 모델을 건너뛰고 답을 받아야 한다");
      assert.equal(calls[0], GEMINI_MODEL, "먼저 기본 모델을 시도한다");
      assert.ok(calls.some((m) => m !== GEMINI_MODEL), "막히면 다른 모델로 넘어간다");
      return calls;
    }
  );
  // 막힌 모델에 세 번 다 걸지 않는다 — 그 시간은 멀쩡한 모델에 쓴다
  assert.equal(out.filter((m) => m === GEMINI_MODEL).length, 2, "과부하 모델은 두 번까지만");
}

// 기본 모델이 살아 있으면 대체 모델을 부르지 않는다 — 품질이 걸린 번역·해설이
// 이유 없이 낮은 모델로 새면 안 된다.
{
  await withFetch(
    () => ok("기본 모델의 답"),
    async (calls) => {
      assert.equal(await geminiText("k", "prompt"), "기본 모델의 답");
      assert.deepEqual(calls, [GEMINI_MODEL], "한 번에 끝나야 한다");
    }
  );
}

// 전부 막히면 빈 문자열 — 호출부의 기존 계약은 그대로 둔다
{
  await withFetch(
    () => overloaded(),
    async (calls) => {
      assert.equal(await geminiText("k", "prompt"), "");
      assert.ok(new Set(calls).size >= 2, "여러 모델을 시도한 뒤 포기한다");
    }
  );
}

// 실패했으면 왜인지 말한다. 빈 문자열만 돌려주던 때는 화면에 "코멘트 생성 실패"만
// 떠서 쿼터인지 키인지 과부하인지 사람이 알 길이 없었다.
{
  await withFetch(
    () => Response.json({ error: { code: 400, message: "API key not valid." } }, { status: 400 }),
    async () => {
      assert.equal(await geminiText("bad", "prompt"), "");
      const msg = withReason("코멘트 생성 실패");
      assert.ok(msg.includes("400"), "상태 코드가 남아야 한다");
      assert.ok(msg.includes("API key not valid."), "원인 문장이 남아야 한다");
      assert.ok(!msg.includes("{"), "원문 JSON을 그대로 흘리지 않는다");
    }
  );
}

// 성공한 호출 뒤에는 이전 실패가 남지 않는다 — Gemini와 무관한 오류에
// 남의 원인이 붙으면 진단이 더 어려워진다.
{
  await withFetch(
    () => ok("답"),
    async () => {
      await geminiText("k", "prompt");
      assert.equal(withReason("다른 실패"), "다른 실패", "원인이 없으면 메시지를 건드리지 않는다");
    }
  );
}

console.log("✓ Gemini 모델 대체·실패 원인");
