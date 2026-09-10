import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_BUDGET_ERROR_CODE,
  AI_PHASES,
  DEFAULT_AI_ACCOUNT_LIMIT,
  aiBudgetExhaustedBody,
  aiBudgetLimits,
  aiBudgetResetAt,
  aiBudgetStatus,
  isAiPhase,
} from "./admin/ai-budget.js";

test("phase limits come from env, falling back to the documented defaults", () => {
  const plain = aiBudgetLimits({});
  assert.equal(plain.phases.research, 25);
  assert.equal(plain.phases.song, 40);
  assert.equal(plain.account, DEFAULT_AI_ACCOUNT_LIMIT);

  const tuned = aiBudgetLimits({ LYRA_AI_DAILY_SONG: "60", LYRA_AI_DAILY_ACCOUNT: "120" });
  assert.equal(tuned.phases.song, 60);
  assert.equal(tuned.account, 120);

  // 쓰레기 값이 한도를 무한대로 만들면 안 된다
  assert.equal(aiBudgetLimits({ LYRA_AI_DAILY_SONG: "abc" }).phases.song, 40);
  assert.equal(aiBudgetLimits({ LYRA_AI_DAILY_SONG: "-5" }).phases.song, 0);
  assert.equal(aiBudgetLimits({ LYRA_AI_DAILY_SONG: "99999" }).phases.song, 500);
});

test("a phase runs out on its own share", () => {
  const status = aiBudgetStatus({ song: 40 }, aiBudgetLimits({}));
  assert.equal(status.phases.song.exhausted, true);
  assert.equal(status.phases.song.remaining, 0);
  // 다른 기능은 멀쩡해야 한다 — 이게 이 작업의 요점이다
  assert.equal(status.phases.movie.exhausted, false);
  assert.equal(status.account.used, 40);
});

test("the account ceiling caps a phase that still has its own room left", () => {
  // song 40 + research 25 + movie 15 = 80 → 계정 상한에 닿는다.
  // carousel은 20회 몫이 통째로 남아 있지만 실제로는 한 번도 못 쓴다.
  const status = aiBudgetStatus({ song: 40, research: 25, movie: 15 }, aiBudgetLimits({}));
  assert.equal(status.account.remaining, 0);
  assert.equal(status.phases.carousel.limit, 20);
  assert.equal(status.phases.carousel.used, 0);
  assert.equal(status.phases.carousel.remaining, 0, "계정이 비면 제 몫이 남아도 못 쓴다");
  assert.equal(status.exhausted, true);
});

test("the exhausted body names which ceiling was hit", () => {
  const limits = aiBudgetLimits({});
  const phaseFull = aiBudgetExhaustedBody("song", aiBudgetStatus({ song: 40 }, limits));
  assert.equal(phaseFull.code, AI_BUDGET_ERROR_CODE);
  assert.match(phaseFull.error, /곡 번역·메타의 오늘 몫/);

  const accountFull = aiBudgetExhaustedBody("carousel", aiBudgetStatus({ song: 40, research: 25, movie: 15 }, limits));
  assert.match(accountFull.error, /전체 상한/, "제 몫이 남았는데 막힌 이유를 그대로 말해야 한다");
  assert.equal(accountFull.phase, "carousel");
  // AI 없이 가는 길을 항상 함께 알린다
  assert.match(accountFull.hint, /AI 없이 저장/);
});

test("reset time is the next KST midnight", () => {
  // 2026-09-11 03:00 KST = 2026-09-10T18:00Z → 21시간 뒤
  const at = new Date("2026-09-10T18:00:00Z");
  const reset = new Date(aiBudgetResetAt(at));
  assert.equal((reset - at) / 3600000, 21);

  // 자정 직전에는 곧 풀린다
  const late = new Date("2026-09-10T14:59:00Z"); // 23:59 KST
  assert.equal(Math.round((new Date(aiBudgetResetAt(late)) - late) / 60000), 1);
});

test("phase names are validated before they reach the database", () => {
  assert.equal(isAiPhase("song"), true);
  assert.equal(isAiPhase("drop table"), false);
  assert.deepEqual(AI_PHASES, ["research", "song", "movie", "carousel"]);
});
