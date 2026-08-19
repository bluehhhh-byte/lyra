import assert from "node:assert/strict";
import { geminiText, withReason, GEMINI_MODEL } from "./admin/gemini.js";

const modelOf = (url) => String(url).match(/models\/([^:]+):/)[1];

const withFetch = async (impl, run) => {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(modelOf(url));
    // 매달린 연결이 maxDuration을 통째로 태우지 않도록 모든 요청에 시한이 있어야 한다.
    // 2026-08-19 오후 gemini-3.6-flash가 15초 넘게 무응답으로 매달린 것이 실제 사고다.
    assert.ok(init?.signal instanceof AbortSignal, "모든 Gemini 요청에 타임아웃 신호가 붙는다");
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
  // 5xx는 모델 전체가 막힌 것 — 재시도하지 않고 즉시 다음 모델로 넘어간다
  assert.equal(out.filter((m) => m === GEMINI_MODEL).length, 1, "과부하 모델은 한 번만 두드린다");
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

// 무응답(timeout)은 재시도하지 않는다 — 매달린 모델을 두 번 두드리면 12초를 또 태운다.
// 2026-08-19 오후 gemini-3.6-flash가 온종일 무응답이었다. 다음 모델로 즉시 넘어간다.
{
  const hang = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  await withFetch(
    (model) => { if (model === GEMINI_MODEL) throw hang; return ok("다음 모델의 답"); },
    async (calls) => {
      assert.equal(await geminiText("k", "prompt"), "다음 모델의 답");
      assert.equal(calls.filter((m) => m === GEMINI_MODEL).length, 1, "매달린 모델은 한 번만");
      assert.ok(withReason("실패").includes("무응답"), "무응답은 일반 실패와 구분해 남긴다");
    }
  );
}

// 400은 같은 모델에서 재시도하지 않는다 — 요청이 틀렸으면 다시 보내도 똑같이 틀린다.
{
  await withFetch(
    (model) =>
      model === GEMINI_MODEL
        ? Response.json({ error: { code: 400, message: "bad request" } }, { status: 400 })
        : ok("다음 모델의 답"),
    async (calls) => {
      assert.equal(await geminiText("k", "prompt"), "다음 모델의 답");
      assert.equal(calls.filter((m) => m === GEMINI_MODEL).length, 1, "400은 재시도하지 않는다");
    }
  );
}

// 대체 순서 — 전부 막히면 기본 → 3.5-flash → 3.5-flash-lite → flash-lite-latest 순으로
// 정확히 한 번씩 두드리고 포기한다.
{
  await withFetch(
    () => overloaded(),
    async (calls) => {
      assert.equal(await geminiText("k", "prompt"), "");
      assert.deepEqual(
        calls,
        [GEMINI_MODEL, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"],
        "대체 사슬을 순서대로 한 번씩"
      );
    }
  );
}

// 48초 예산이 끝나면 새 요청을 시작하지 않는다 — Vercel이 함수를 죽이기 전에
// 우리가 먼저 포기해야 실패 이유라도 화면에 남는다.
{
  const realNow = Date.now;
  let t = 1_000_000;
  Date.now = () => t;
  try {
    await withFetch(
      () => { t += 25_000; return overloaded(); }, // 요청 하나가 25초를 먹는 셈
      async (calls) => {
        assert.equal(await geminiText("k", "prompt"), "");
        assert.equal(calls.length, 2, "예산(48초)을 넘긴 뒤에는 다음 모델을 시작하지 않는다");
      }
    );
  } finally {
    Date.now = realNow;
  }
}

console.log("OK: timeout·400·순서·예산");
