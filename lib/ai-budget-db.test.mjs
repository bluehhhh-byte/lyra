import assert from "node:assert/strict";
import test from "node:test";
import { readAiBudget, readAiUsageFor, reserveAiCall } from "./admin/research-budget-db.js";

// 가짜 sql — 실제 Neon 없이 예약 규칙만 검증한다. 태그드 템플릿의 문자열
// 조각으로 어떤 질의인지 가려내고, 충돌 갱신의 WHERE(한도)를 흉내 낸다.
function fakeSql({ phaseRows = {}, researchUsed = 0 } = {}) {
  const state = { phase: { ...phaseRows }, research: researchUsed, inserts: [] };
  const sql = (strings, ...values) => {
    const text = strings.join("?");
    if (/create table|alter table/.test(text)) return Promise.resolve([]);
    if (/from lyra_ai_phase_daily/.test(text)) {
      return Promise.resolve(Object.entries(state.phase).map(([phase, used]) => ({ phase, used })));
    }
    if (/from lyra_ai_research_daily/.test(text)) {
      return Promise.resolve(state.research ? [{ used: state.research }] : []);
    }
    if (/insert into lyra_ai_phase_daily/.test(text)) {
      const phase = values[1];
      const limit = values[values.length - 1]; // WHERE used < $limit
      const used = state.phase[phase] || 0;
      if (used >= limit) return Promise.resolve([]); // 충돌 갱신의 WHERE가 막는다
      state.phase[phase] = used + 1;
      state.inserts.push(phase);
      return Promise.resolve([{ used: state.phase[phase] }]);
    }
    return Promise.resolve([]);
  };
  sql.state = state;
  return sql;
}

const at = new Date("2026-09-11T03:00:00+09:00");

test("a fresh day lets every phase through", async () => {
  const sql = fakeSql();
  const status = await readAiBudget(sql, { at, env: {} });
  assert.equal(status.account.used, 0);
  assert.equal(status.phases.song.remaining, 40);

  const ok = await reserveAiCall(sql, { phase: "song", at, env: {}, ref: "some-slug" });
  assert.equal(ok.allowed, true);
  assert.equal(ok.status.phases.song.used, 1);
});

test("a phase at its limit is refused, and the reason says which ceiling", async () => {
  const sql = fakeSql({ phaseRows: { song: 40 } });
  const denied = await reserveAiCall(sql, { phase: "song", at, env: {} });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "phase");
  // 다른 기능은 여전히 통과해야 한다 — 이 작업의 핵심
  const other = await reserveAiCall(sql, { phase: "movie", at, env: {} });
  assert.equal(other.allowed, true);
});

test("the account ceiling refuses a phase that still has room", async () => {
  // song 40 + movie 20 = 60, research 20 → 합계 80 = 계정 상한
  const sql = fakeSql({ phaseRows: { song: 40, movie: 20 }, researchUsed: 20 });
  const denied = await reserveAiCall(sql, { phase: "carousel", at, env: {} });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "account");
  assert.equal(denied.status.phases.carousel.used, 0, "제 몫은 손도 안 댔는데 막힌다");
  assert.deepEqual(sql.state.inserts, [], "거부된 호출은 카운터를 올리지 않는다");
});

test("research usage is counted from its own table", async () => {
  const sql = fakeSql({ phaseRows: { song: 2 }, researchUsed: 7 });
  const status = await readAiBudget(sql, { at, env: {} });
  assert.equal(status.phases.research.used, 7);
  assert.equal(status.account.used, 9);

  const usage = await readAiUsageFor(sql, "2026-09-11");
  assert.equal(usage.total, 9);
  assert.equal(usage.phases.research, 7);
});

test("an unknown phase never reaches the database", async () => {
  const sql = fakeSql();
  await assert.rejects(() => reserveAiCall(sql, { phase: "; drop table", at, env: {} }), /알 수 없는 AI 기능/);
});

test("env overrides change what the reservation allows", async () => {
  const sql = fakeSql({ phaseRows: { movie: 20 } });
  const denied = await reserveAiCall(sql, { phase: "movie", at, env: {} });
  assert.equal(denied.allowed, false);
  const raised = await reserveAiCall(sql, { phase: "movie", at, env: { LYRA_AI_DAILY_MOVIE: "30" } });
  assert.equal(raised.allowed, true);
});
