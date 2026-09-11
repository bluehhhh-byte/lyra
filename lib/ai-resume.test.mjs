import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const dashboard = fs.readFileSync(new URL("../app/admin/usage/usage-dashboard.js", import.meta.url), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("the resume affordance points at a command that exists", () => {
  const shown = dashboard.match(/<code[^>]*>\s*([^<]+?)\s*<\/code>/)?.[1] || "";
  assert.equal(shown, "pnpm appearances:resume");
  // 화면이 안내하는 명령이 실제로 있어야 한다 — 없는 명령을 적어 두면
  // 장애 한복판에서 사람이 오타부터 의심하게 된다.
  assert.ok(pkg.scripts["appearances:resume"], "package.json에 appearances:resume가 있어야 한다");
});

test("resuming is offered only when today's budget can actually pay for it", () => {
  assert.match(
    dashboard,
    /const canResume = !budget\.exhausted && !budget\.providerBlocked && pending > 0/,
    "소진·공급자 차단·남은 곡 없음 중 하나라도면 재개를 권하지 않는다",
  );
  assert.match(dashboard, /value\.resetAt/, "막혔을 때는 언제 풀리는지 알려야 한다");
  assert.match(dashboard, /AI 공급자가 호출을 막았습니다/, "공급자 차단과 자체 한도 소진은 다른 문장이어야 한다");
});

test("the reset time is computed server-side in KST", () => {
  const db = fs.readFileSync(new URL("./admin/research-budget-db.js", import.meta.url), "utf8");
  assert.match(db, /resetAt: aiBudgetResetAt\(at\)/, "브라우저 시간대로 계산하면 KST가 아닌 곳에서 거짓이 된다");
});

test("the dashboard uses state tokens, not raw palette classes", () => {
  // dark: 변형은 OS를 따라가고 이 사이트는 data-theme으로 테마를 정한다.
  assert.doesNotMatch(dashboard, /text-(amber|emerald|red|green)-\d{3}/, "상태색은 ok/warn/danger 토큰만");
});
