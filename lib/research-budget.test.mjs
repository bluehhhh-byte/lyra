import assert from "node:assert/strict";
import {
  DEFAULT_APPEARANCE_AI_DAILY_LIMIT,
  normalizeResearchBudget,
  reconcileResearchCheckpoint,
  researchBudgetStatus,
  reserveResearchCall,
} from "./admin/research-budget.js";

let budget = normalizeResearchBudget();
let reserved = reserveResearchCall(budget, {
  limit: 2,
  at: new Date("2026-09-03T14:59:59.000Z"),
  phase: "verify",
  songSlug: "song-a",
});
assert.equal(reserved.allowed, true);
budget = reserved.budget;
reserved = reserveResearchCall(budget, { limit: 2, at: new Date("2026-09-03T14:59:59.500Z") });
assert.equal(reserved.allowed, true);
budget = reserved.budget;
reserved = reserveResearchCall(budget, { limit: 2, at: new Date("2026-09-03T14:59:59.900Z") });
assert.equal(reserved.allowed, false, "실패 재시도도 같은 날 상한을 넘을 수 없어야 한다");
assert.equal(reserved.status.day, "2026-09-03");
assert.equal(reserved.status.remaining, 0);

const nextDay = reserveResearchCall(budget, { limit: 2, at: new Date("2026-09-03T15:00:00.000Z") });
assert.equal(nextDay.allowed, true, "한국 시간 자정에 새 일일 예산이 열려야 한다");
assert.equal(nextDay.status.day, "2026-09-04");
assert.equal(researchBudgetStatus(nextDay.budget, { limit: DEFAULT_APPEARANCE_AI_DAILY_LIMIT, at: new Date("2026-09-03T15:00:01.000Z") }).used, 1);

const audit = {
  totalSongs: 2,
  corpusDigest: "old",
  results: { a: { status: "verified" }, removed: { status: "no_match" } },
};
const reconciled = reconcileResearchCheckpoint(audit, ["a", "new"], {
  corpusDigest: "new",
  at: new Date("2026-09-03T00:00:00.000Z"),
  makePending: (slug) => ({ status: "pending", slug }),
});
assert.deepEqual(reconciled, { changed: true, added: ["new"], removed: ["removed"] });
assert.equal(audit.results.a.status, "verified", "완료한 조사 결과를 유지해야 한다");
assert.equal(audit.results.new.status, "pending", "새 곡만 재개 대기열에 들어가야 한다");
assert.equal(audit.results.removed, undefined);
assert.equal(audit.retiredResults.removed.status, "no_match", "삭제 곡 결과도 감사 이력에는 보존해야 한다");
assert.equal(audit.totalSongs, 2);
assert.equal(audit.corpusDigest, "new");

console.log("AI research daily budget and resumable checkpoint passed");
