import assert from "node:assert/strict";
import test from "node:test";
import {
  ALERT_AT,
  LIMITS,
  QUOTA_ISSUE_TITLE,
  evaluateQuota,
  pickNeonProject,
  scopedProjectIdFrom,
  projectMatchesDatabase,
  endpointIdFromDatabaseUrl,
  renderQuotaReport,
  thresholdFor,
} from "./quota-watch.js";

const healthy = {
  version: { sha: "abc", contentStore: "neon", contentFallback: false, cachePayload: { measured: true, bytes: 480_000, limit: 2_097_152 } },
  health: { ok: true, message: "정상 · abc · neon" },
  neon: { configured: true, dataTransferBytes: 600_000_000 }, // 0.6GB — 월 정상치
  ai: { total: 9, phases: { research: 7, song: 2 } },
};

test("a healthy day raises nothing", () => {
  const result = evaluateQuota(healthy);
  assert.equal(result.alert, false);
  assert.deepEqual(result.reasons, []);
  assert.ok(result.checks.every((c) => c.ok));
});

test("thresholds step at 50/70/85 percent", () => {
  assert.equal(thresholdFor(0.4 * LIMITS.neonTransferBytes, LIMITS.neonTransferBytes).level, "ok");
  assert.equal(thresholdFor(0.5 * LIMITS.neonTransferBytes, LIMITS.neonTransferBytes).level, "notice");
  assert.equal(thresholdFor(0.7 * LIMITS.neonTransferBytes, LIMITS.neonTransferBytes).level, "warning");
  assert.equal(thresholdFor(0.9 * LIMITS.neonTransferBytes, LIMITS.neonTransferBytes).level, "danger");
  // 한도가 0이면 0으로 나누지 않는다
  assert.equal(thresholdFor(100, 0).ratio, 0);
});

test("half the monthly transfer is reported but does not open an issue", () => {
  // 매달 중순이면 절반은 정상적으로 지나간다 — 이슈로 만들면 경보가 소음이 된다
  const result = evaluateQuota({ ...healthy, neon: { configured: true, dataTransferBytes: 0.55 * LIMITS.neonTransferBytes } });
  assert.equal(result.alert, false);
  assert.ok(ALERT_AT > 0.5);
});

test("70 percent of the Neon transfer opens an alert with the consequence spelled out", () => {
  const result = evaluateQuota({ ...healthy, neon: { configured: true, dataTransferBytes: 0.72 * LIMITS.neonTransferBytes } });
  assert.equal(result.alert, true);
  assert.match(result.reasons[0], /72\.0%/);
  assert.match(result.reasons[0], /compute가 멈춥니다/, "무엇이 일어나는지 알려야 사람이 움직인다");
});

test("the file fallback is an alert on its own, whatever the numbers say", () => {
  const result = evaluateQuota({ ...healthy, version: { ...healthy.version, contentFallback: true } });
  assert.equal(result.alert, true);
  assert.match(result.reasons[0], /파일 백업/);
});

test("a failed healthcheck carries its own message into the reason", () => {
  const result = evaluateQuota({ ...healthy, health: { ok: false, message: "헬스체크 HTTP 500" } });
  assert.equal(result.alert, true);
  assert.match(result.reasons[0], /HTTP 500/);
});

test("a cache payload near the silent-skip ceiling is an alert", () => {
  // 2MiB를 넘으면 unstable_cache가 던지지 않고 저장을 건너뛴다 — 캐시가 도는
  // 것처럼 보이면서 매 요청이 DB를 읽는다. 넘기 전에 알아야 한다.
  const result = evaluateQuota({
    ...healthy,
    version: { ...healthy.version, cachePayload: { measured: true, bytes: 1_950_000, limit: 2_097_152 } },
  });
  assert.equal(result.alert, true);
  assert.match(result.reasons[0], /조용히 꺼지고/);
});

test("an unmeasurable provider is reported as unmeasured, never as zero", () => {
  const result = evaluateQuota({ ...healthy, neon: { configured: false, error: "NEON_API_KEY 미설정" } });
  assert.equal(result.alert, false, "못 읽은 것을 위반으로 만들지 않는다");
  const row = result.checks.find((c) => c.name === "Neon 월 전송량");
  assert.match(row.detail, /실측 불가|미설정/, "0GB로 보이면 안전하다고 착각한다");
});

test("the report is readable markdown and names the day in KST", () => {
  const at = new Date("2026-09-10T16:00:00Z"); // 2026-09-11 01:00 KST
  const report = renderQuotaReport(evaluateQuota(healthy), { at });
  assert.match(report, /# 무료티어 점검 · 2026-09-11 \(KST\)/);
  assert.match(report, /\| 항목 \| 상태 \| 값 \|/);
  assert.match(report, /이상 없음/);

  const alerted = renderQuotaReport(evaluateQuota({ ...healthy, version: { ...healthy.version, contentFallback: true } }), { at });
  assert.match(alerted, /\*\*경보\*\*/);
  assert.match(alerted, /## 사유/);
});

test("the issue title is fixed so repeat alerts can find the open one", () => {
  assert.equal(typeof QUOTA_ISSUE_TITLE, "string");
  assert.ok(QUOTA_ISSUE_TITLE.length > 0);
});

// 못 읽은 전송량을 "정상"으로 칠하지 않는다. 초록이면 사람은 여유가 있다고
// 읽는데 실제로는 아무것도 모르는 상태다 — 2026-09-12에 402가 나고서야 알았다.
{
  const unset = evaluateQuota({ version: { contentStore: "neon" }, health: { ok: true }, neon: { configured: false, error: "NEON_API_KEY 미설정" } });
  const row = unset.checks.find((c) => c.name === "Neon 월 전송량");
  assert.equal(row.unknown, true, "모르는 것은 모른다고 표시한다");
  assert.match(renderQuotaReport(unset), /확인 불가/);
  assert.equal(unset.alert, false, "설정 공백은 사고가 아니다 — 매일 경보를 울리지 않는다");

  // 키를 넣어 뒀는데 못 읽는 것은 설정 공백이 아니라 고장이다
  const broken = evaluateQuota({ version: { contentStore: "neon" }, health: { ok: true }, neon: { configured: true, error: "Neon API 조회 실패: HTTP 401" } });
  assert.equal(broken.alert, true, "감시가 꺼진 줄 모르고 지나가면 안 된다");
  assert.ok(broken.reasons.some((r) => /읽지 못했습니다/.test(r)));

  // 읽힌 값은 종전대로 판정한다
  const hot = evaluateQuota({ version: { contentStore: "neon" }, health: { ok: true }, neon: { configured: true, dataTransferBytes: 4.5e9 } });
  assert.equal(hot.alert, true);
  assert.ok(!hot.checks.find((c) => c.name === "Neon 월 전송량").unknown);
}

// 프로젝트 ID는 연결 문자열에 없다(엔드포인트 이름만 있다). 키만으로 목록을
// 받아 고르되, 여럿이면 고르지 않는다 — 엉뚱한 프로젝트를 읽고 "여유 있다"고
// 말하는 것이 못 읽는 것보다 나쁘다.
{
  assert.equal(pickNeonProject([{ id: "abc", name: "lyra" }]).id, "abc");
  assert.equal(pickNeonProject([{ id: "a" }, { id: "b" }]).id, "");
  assert.match(pickNeonProject([{ id: "a", name: "lyra" }, { id: "b", name: "old" }]).error, /NEON_PROJECT_ID/);
  assert.match(pickNeonProject([]).error, /프로젝트가 없습니다/);
}
console.log("✓ 모르는 것을 안전으로 읽지 않는다");

// 감시가 엉뚱한 프로젝트를 읽고 "이상 없음"을 보고하면 못 읽는 것보다 나쁘다.
// 2026-09-12에 실제로 그 상태였다 — 키가 안 쓰는 프로젝트에 묶여 전송량이
// 0.000GB로 왔는데, 사이트가 붙은 프로젝트는 한도를 넘겨 402를 내고 있었다.
{
  const live = "postgresql://u:p@ep-little-rain-axw7fmrs-pooler.c-4.us-east-2.aws.neon.tech/neondb";
  assert.equal(endpointIdFromDatabaseUrl(live), "ep-little-rain-axw7fmrs", "-pooler는 접미사일 뿐이다");
  assert.equal(endpointIdFromDatabaseUrl("쓰레기"), "");

  const wrong = projectMatchesDatabase({ endpoints: [{ id: "ep-restless-cake-aych4j2b" }], databaseUrl: live });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.unknown, false, "이건 모르는 게 아니라 틀린 것이다");
  assert.match(wrong.error, /다릅니다/);

  const right = projectMatchesDatabase({ endpoints: [{ id: "ep-little-rain-axw7fmrs" }], databaseUrl: live });
  assert.equal(right.ok, true);

  // 대조할 근거가 없으면 "맞다"고 하지 않는다
  for (const blind of [{ endpoints: [], databaseUrl: live }, { endpoints: [{ id: "x" }], databaseUrl: "" }])
    assert.equal(projectMatchesDatabase(blind).unknown, true);
}

// 프로젝트 한정 키는 목록을 거부하면서 본문에 자기 프로젝트 ID를 적어 준다.
// 좁은 권한 키를 쓰면서도 사람이 ID를 따로 적지 않아도 되게 그것을 줍는다.
{
  const body = 'not allowed to perform actions outside the project this key is scoped to; subject_project_id:"raspy-band-56009664"';
  assert.equal(scopedProjectIdFrom(body), "raspy-band-56009664");
  assert.equal(scopedProjectIdFrom("그냥 오류"), "");
  assert.equal(scopedProjectIdFrom(), "");
}
console.log("✓ 남의 프로젝트를 읽고 안심하지 않는다");
