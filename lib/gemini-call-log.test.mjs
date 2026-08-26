import assert from "node:assert/strict";
import { geminiText, GEMINI_MODEL, recordGeminiCall } from "./admin/gemini.js";

const lines = [];
const realInfo = console.info;
const realFetch = globalThis.fetch;
console.info = (line) => lines.push(JSON.parse(line));
globalThis.fetch = async (url) => {
  const model = String(url).match(/models\/([^:]+):/)?.[1];
  if (model === GEMINI_MODEL)
    return Response.json({ error: { message: "overloaded" } }, { status: 503 });
  return Response.json({ candidates: [{ content: { parts: [{ text: "응답" }] } }] });
};

try {
  assert.equal(await geminiText("test-key", "secret prompt"), "응답");
} finally {
  console.info = realInfo;
  globalThis.fetch = realFetch;
}

assert.equal(lines[0].model, GEMINI_MODEL);
assert.equal(lines[0].outcome, "failure");
assert.equal(lines[0].status, 503);
assert.equal(lines.filter((line) => line.model === GEMINI_MODEL).length, 1, "5xx 모델은 재시도하지 않는다");
assert.equal(lines.at(-1).outcome, "success");
assert.match(lines[0].at, /^\d{4}-\d{2}-\d{2}T/);
assert.equal(typeof lines[0].durationMs, "number");
assert.ok(lines.every((line) => !("key" in line) && !("prompt" in line)), "키와 프롬프트를 기록하면 안 된다");

const direct = recordGeminiCall(
  { model: "test-model", startedAt: Date.now(), outcome: "failure", reason: "실패" },
  () => {}
);
assert.equal(direct.model, "test-model");
assert.equal(direct.reason, "실패");

console.log("Gemini 호출 기록 검증 통과");
