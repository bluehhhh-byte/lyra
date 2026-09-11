import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  VERCEL_HOBBY_LIMITS,
  parseVercelUsage,
  readVercelUsage,
  usageSourceLabel,
  vercelLimits,
  vercelUsageUrl,
} from "./vercel-usage.js";

const at = new Date("2026-09-11T08:00:00Z");

test("the request matches the contract the API actually enforces", () => {
  // 2026-09-11 실측: epoch ms를 주면 invalid_from_date로 거부하고 ISO만 받는다
  const url = new URL(vercelUsageUrl({ from: new Date("2026-09-01T00:00:00Z"), to: at, teamId: "team_x" }));
  assert.equal(url.origin + url.pathname, "https://api.vercel.com/v1/usage");
  assert.equal(url.searchParams.get("from"), "2026-09-01T00:00:00.000Z");
  assert.equal(url.searchParams.get("to"), "2026-09-11T08:00:00.000Z");
  assert.equal(url.searchParams.get("teamId"), "team_x");
  // 팀이 없으면 파라미터 자체를 빼야 한다 — 빈 문자열은 잘못된 팀으로 읽힌다
  assert.equal(new URL(vercelUsageUrl({ from: at, to: at })).searchParams.has("teamId"), false);
});

test("no token means unmeasured, not zero", async () => {
  const usage = await readVercelUsage({ env: {}, at });
  assert.equal(usage.measured, false);
  assert.equal(usage.source, "none");
  assert.match(usage.error, /LYRA_VERCEL_TOKEN/);
  assert.equal(usageSourceLabel(usage), "출처: 자체 추정");
});

test("an API error is reported with its status, never silently zeroed", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => '{"error":{"code":"forbidden"}}' });
  const usage = await readVercelUsage({ env: { LYRA_VERCEL_TOKEN: "t" }, at, fetchImpl });
  assert.equal(usage.measured, false);
  assert.match(usage.error, /403/);
  assert.match(usage.error, /forbidden/);
  assert.equal(usageSourceLabel(usage), "출처: 자체 추정");
});

test("a thrown request becomes an unmeasured result, not a crash", async () => {
  const fetchImpl = async () => { throw new Error("네트워크 끊김"); };
  const usage = await readVercelUsage({ env: { LYRA_VERCEL_TOKEN: "t" }, at, fetchImpl });
  assert.equal(usage.measured, false);
  assert.match(usage.error, /네트워크 끊김/);
});

test("a good response is labelled as measured, with the date it was read", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ activeCpuHours: 1.25, invocations: 4321, fastDataTransfer: 987_654_321 }),
  });
  const usage = await readVercelUsage({ env: { LYRA_VERCEL_TOKEN: "t" }, at, fetchImpl });
  assert.equal(usage.measured, true);
  assert.equal(usage.source, "vercel-api");
  assert.equal(usage.activeCpuHours, 1.25);
  assert.equal(usage.invocations, 4321);
  assert.equal(usage.fastDataTransferBytes, 987_654_321);
  assert.equal(usageSourceLabel(usage), "출처: Vercel API, 2026-09-11");
});

test("the parser survives a response shaped differently than guessed", () => {
  // 응답 필드는 검증하지 못했다(토큰 만료). 그래서 이름을 박지 않고 훑는다 —
  // 중첩과 {total} 형태를 모두 받아야 한다.
  const nested = parseVercelUsage({ usage: { activeCpuHours: { total: 2.5 }, invocations: { total: 10 } } });
  assert.equal(nested.measured, true);
  assert.equal(nested.activeCpuHours, 2.5);

  const snake = parseVercelUsage({ metrics: { active_cpu_hours: 0.5 } });
  assert.equal(snake.activeCpuHours, 0.5);

  // 하나도 못 찾으면 실측 실패다 — 0으로 채우지 않는다
  const unknown = parseVercelUsage({ something: { else: 1 } });
  assert.equal(unknown.measured, false);
  assert.equal(unknown.activeCpuHours, null);
});

test("Hobby limits are the documented defaults and can be overridden", () => {
  assert.equal(VERCEL_HOBBY_LIMITS.activeCpuHours, 4);
  assert.equal(VERCEL_HOBBY_LIMITS.invocations, 1_000_000);
  assert.equal(VERCEL_HOBBY_LIMITS.fastDataTransferBytes, 100e9);

  const limits = vercelLimits({ LYRA_VERCEL_LIMIT_CPU_HOURS: "8" });
  assert.equal(limits.activeCpuHours, 8);
  assert.equal(limits.invocations, 1_000_000, "덮어쓰지 않은 값은 기본값 그대로");
  // 쓰레기 값이 한도를 없애면 안 된다
  assert.equal(vercelLimits({ LYRA_VERCEL_LIMIT_CPU_HOURS: "abc" }).activeCpuHours, 4);
});

test("the dashboard labels the source and never fakes a measurement", () => {
  const dashboard = fs.readFileSync(new URL("../app/admin/usage/usage-dashboard.js", import.meta.url), "utf8");
  assert.match(dashboard, /function VercelCard/);
  assert.match(dashboard, /출처: Vercel API/);
  assert.match(dashboard, /출처: 자체 추정/);
  // 값을 못 읽은 칸은 0이 아니라 "실측 불가"로 보여야 한다
  assert.match(dashboard, /실측 불가/);
  assert.match(dashboard, /row\.used == null/);
});

test("the metrics payload carries the source through to the screen", () => {
  const metrics = fs.readFileSync(new URL("./usage-metrics.js", import.meta.url), "utf8");
  assert.match(metrics, /readVercelUsage\(\{ env: process\.env \}\)/);
  assert.match(metrics, /exactAvailable: vercelUsage\.measured === true/);
  assert.doesNotMatch(metrics, /Vercel Hobby는 Usage API를 제공하지 않아/, "엔드포인트는 실재한다 — 옛 단정을 남기지 않는다");
});
