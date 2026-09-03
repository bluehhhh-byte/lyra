import assert from "node:assert/strict";
import {
  markResearchBudgetBlocked,
  clearResearchProviderBlock,
  readResearchDashboard,
  reserveResearchBudget,
  writeResearchCheckpoint,
} from "./admin/research-budget-db.js";

const calls = [];
const sql = async (strings, ...values) => {
  const query = strings.join("?").replace(/\s+/g, " ").trim();
  calls.push({ query, values });
  if (query.includes("returning used")) return [{ used: 3, last_call_at: "2026-09-03T01:00:00.000Z", last_phase: "verify", last_song_slug: "song-a", blocked_at: null, blocked_reason: "" }];
  if (query.includes("from lyra_ai_research_daily") && query.includes("select used")) return [{ used: 3, last_call_at: "2026-09-03T01:00:00.000Z", last_phase: "verify", last_song_slug: "song-a", blocked_at: null, blocked_reason: "" }];
  if (query.includes("from lyra_ai_research_state")) return [{
    audit: "exhaustive", total_songs: 955, researched: 950, pending: 5, retired: 5,
    statuses: { verified: 35 }, updated_at: "2026-09-03T01:00:00.000Z",
  }];
  return [];
};

const reserved = await reserveResearchBudget(sql, {
  limit: 25,
  at: new Date("2026-09-03T01:00:00.000Z"),
  phase: "verify",
  songSlug: "song-a",
});
assert.equal(reserved.allowed, true);
assert.equal(reserved.status.used, 3);
assert.equal(reserved.status.remaining, 22);
assert.equal(reserved.status.storage, "neon");
assert.ok(calls.some((call) => /on conflict \(day\).*where lyra_ai_research_daily\.used <.*blocked_at is null/.test(call.query)), "원자적 상한과 공급자 차단 조건이 필요하다");

await writeResearchCheckpoint(sql, { totalSongs: 955, researched: 950, pending: 5, statuses: { pending: 5 } });
assert.ok(calls.some((call) => call.query.includes("on conflict (audit) do update")));

const dashboard = await readResearchDashboard(sql, { limit: 25, at: new Date("2026-09-03T01:00:00.000Z") });
assert.equal(dashboard.budget.used, 3);
assert.equal(dashboard.checkpoint.pending, 5);
assert.equal(dashboard.checkpoint.totalSongs, 955);

const beforeZero = calls.length;
const blocked = await reserveResearchBudget(sql, { limit: 0, at: new Date("2026-09-03T01:00:00.000Z") });
assert.equal(blocked.allowed, false);
assert.ok(calls.slice(beforeZero).every((call) => !call.query.includes("insert into lyra_ai_research_daily")), "0회 상한은 예약 write를 만들면 안 된다");

await markResearchBudgetBlocked(sql, { limit: 25, reason: "429 quota" });
assert.ok(calls.some((call) => call.query.includes("blocked_at = excluded.blocked_at")), "공급자 차단 상태를 날짜별로 저장해야 한다");
assert.ok(calls.some((call) => call.query.includes("lyra_ai_research_provider_state") && call.query.includes("blocked_until")), "날짜 경계를 넘는 공급자 차단 상태가 필요하다");
await clearResearchProviderBlock(sql);
assert.ok(calls.some((call) => call.query.includes("set blocked_at = null")), "성공 후 공급자 차단을 해제해야 한다");

console.log("Neon atomic AI research budget passed");
