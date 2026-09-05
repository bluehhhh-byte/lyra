import assert from "node:assert/strict";
import { geminiGrounded, geminiText, withReason, GEMINI_MODEL } from "./admin/gemini.js";

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

// Vercel 환경변수를 붙여넣을 때 BOM·공백·따옴표가 섞여도 키 자체만 전송한다.
// DATABASE_URL에서 실제로 이 문제가 이틀간 조용히 저장소를 꺼 둔 적이 있다.
{
  await withFetch(
    (_model, url) => {
      assert.equal(new URL(url).searchParams.get("key"), "test-key", "환경변수 장식을 제거한 키만 보낸다");
      return ok("답");
    },
    async () => assert.equal(await geminiText('\uFEFF  "test-key"  ', "prompt"), "답")
  );
}

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

// 작품 수록 정보처럼 사실 확인이 필요한 호출은 Google Search 도구를 켜고,
// 실제 답을 뒷받침한 grounding chunk만 출처로 돌려준다.
{
  await withFetch(
    (_model, _url, init) => {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.tools, [{ google_search: {} }]);
      return Response.json({
        candidates: [{
          content: { parts: [{ text: '{"found":true}' }] },
          groundingMetadata: {
            webSearchQueries: ["song soundtrack"],
            groundingChunks: [
              { web: { uri: "https://official.example/ost", title: "Official OST" } },
              { web: { uri: "https://unused.example", title: "Unused" } },
            ],
            groundingSupports: [{ groundingChunkIndices: [0] }],
          },
        }],
      });
    },
    async () => {
      const result = await geminiGrounded("k", "search prompt");
      assert.equal(result.text, '{"found":true}');
      assert.deepEqual(result.sources, [{ uri: "https://official.example/ost", title: "Official OST" }]);
      assert.deepEqual(result.queries, ["song soundtrack"]);
    }
  );
}

console.log("OK: Google Search grounding 출처");

// 대량 조사에서는 실제 HTTP 시도마다 공용 예산을 예약하고, 공급자가 429를
// 돌려주면 같은 모델 재시도와 대체 모델 순회를 모두 멈춘다.
{
  let reservations = 0;
  await withFetch(
    () => Response.json({ error: { code: 429, message: "quota exhausted" } }, { status: 429 }),
    async (calls) => {
      const result = await geminiGrounded("k", "search prompt", GEMINI_MODEL, {
        beforeAttempt: async ({ attempt }) => {
          reservations++;
          assert.equal(attempt, 1);
        },
        stopOnRateLimit: true,
      });
      assert.equal(result, null);
      assert.equal(reservations, 1, "실제 네트워크 시도 하나만 예약해야 한다");
      assert.deepEqual(calls, [GEMINI_MODEL], "429 뒤에는 재시도하거나 다른 모델을 호출하면 안 된다");
    }
  );
}

console.log("OK: 대량 조사 호출별 예산·429 즉시 중단");

// 장문 리포트는 기본 12초 안에 못 끝난다. 좋은 모델부터 차례로 잘려 나가고
// lite 모델만 남는 것이 실제 증상이었으므로, 옵션이 실제로 요청 시한을 늘리는지
// AbortSignal의 남은 시간으로 확인한다.
{
  const { LONG_FORM_TIMEOUT_MS } = await import("./admin/gemini.js");
  const seen = [];
  await withFetch(
    async (_model, _url, init) => {
      // AbortSignal.timeout(ms)는 ms를 직접 노출하지 않으므로, 신호가 언제
      // 끊기는지를 재는 대신 호출 시점의 시한을 경주시켜 관측한다.
      const signal = init.signal;
      const fired = await Promise.race([
        new Promise((r) => signal.addEventListener("abort", () => r(true), { once: true })),
        new Promise((r) => setTimeout(() => r(false), 50)),
      ]);
      seen.push(fired);
      return Response.json({ candidates: [{ content: { parts: [{ text: "리포트" }] } }] });
    },
    async () => {
      assert.equal(await geminiText("k", "장문", false, GEMINI_MODEL, { timeoutMs: LONG_FORM_TIMEOUT_MS }), "리포트");
    }
  );
  assert.deepEqual(seen, [false], "40초 시한이면 50ms 안에 끊기지 않는다");
  assert.ok(LONG_FORM_TIMEOUT_MS > 12_000, "장문 시한은 기본값보다 길어야 한다");
}

// 옵션을 주지 않은 기존 호출부의 동작은 그대로여야 한다.
{
  await withFetch(
    async () => Response.json({ candidates: [{ content: { parts: [{ text: "짧은 답" }] } }] }),
    async () => assert.equal(await geminiText("k", "짧은 프롬프트"), "짧은 답")
  );
}

console.log("✓ gemini — 장문 리포트 시한 옵션");

// 그라운딩 429는 계정의 검색 한도가 소진된 것이라 모델을 바꿔도 같다. 사슬을 돌면
// 남은 한도를 더 태우고 시간만 버린다 — 첫 429에서 멈춰야 한다.
{
  const tried = [];
  await withFetch(
    async (model) => {
      tried.push(model);
      return Response.json({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
    },
    async () => assert.equal(await geminiGrounded("k", "질문"), null)
  );
  assert.equal(tried.length, 1, `429를 만나면 첫 모델에서 멈춘다 (실제 ${tried.length}개 시도)`);
  assert.match(withReason("리서치 실패"), /그라운딩 한도 소진/, "모델 탓으로 읽히지 않는 문구여야 한다");
  assert.doesNotMatch(withReason("리서치 실패"), /gemini-[\w.-]+: 429/, "모델 이름만 적으면 다른 모델을 시도하게 만든다");
}

// 그라운딩이 아닌 일반 호출은 종전대로 대체 모델을 시도한다 — 그쪽 429는 모델별이다.
{
  const tried = [];
  await withFetch(
    async (model) => {
      tried.push(model);
      return Response.json({ error: { code: 429 } }, { status: 429 });
    },
    async () => assert.equal(await geminiText("k", "질문"), "")
  );
  assert.ok(tried.length > 1, `일반 호출은 사슬을 계속 돈다 (실제 ${tried.length}개)`);
}

console.log("✓ gemini — 그라운딩 429는 사슬을 돌지 않는다");
