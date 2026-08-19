// 폴링 일정 — 3초 고정 100회(5분에 100번 조회)를 지수형 백오프 15회로 줄였다.
import assert from "node:assert/strict";
import { delayAt, elapsedAt, MAX_POLLS, MAX_ELAPSED_MS, POLL_DELAYS_MS } from "./deploy-poll.js";

assert.deepEqual(POLL_DELAYS_MS.slice(0, 6), [3000, 5000, 8000, 13000, 20000, 30000], "처음엔 촘촘히, 이후 느리게");
assert.equal(delayAt(0), 3000);
assert.equal(delayAt(100), 30000, "상한은 30초");
assert.equal(MAX_POLLS, 15, "5분 창에서 최대 15회");
assert.ok(MAX_ELAPSED_MS === 5 * 60_000);

// 15회를 다 써도 조회 횟수가 예산을 넘지 않는다 — 시간 상한과 횟수 상한 중
// 먼저 닿는 쪽에서 멈춘다 (클라이언트 루프 조건과 동일한 계산)
let polls = 0;
for (let i = 0; i < MAX_POLLS && elapsedAt(i) < MAX_ELAPSED_MS; i++) polls++;
assert.ok(polls <= 15, `최대 15회 (실제 ${polls}회)`);
assert.ok(elapsedAt(polls - 1) <= MAX_ELAPSED_MS, "마지막 조회도 5분 창 안에서 시작된다");

console.log("✓ 폴링 백오프 일정");
