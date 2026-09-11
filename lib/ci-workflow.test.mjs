import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/check.yml", import.meta.url), "utf8");

test("CI restores the private export and runs the real Instagram verifier", () => {
  assert.match(workflow, /schedule:[\s\S]*cron: "23 18 \* \* 1"/);
  assert.match(workflow, /secrets\.INSTAGRAM_EXPORT_URL/);
  assert.match(workflow, /pnpm verify:instagram -- "\$INSTAGRAM_EXPORT_DIR"/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(workflow, /sed -i|perl -pi|git commit/, "원문 대조 작업은 콘텐츠를 수정하지 않아야 한다");
});

test("CI installs Chromium and runs numerical layout verification", () => {
  assert.match(workflow, /pnpm exec playwright install --with-deps chromium/);
  assert.match(workflow, /next start -p 3401/);
  assert.match(workflow, /node scripts\/verify-layout\.mjs http:\/\/localhost:3401/);
});

const quotaWatch = fs.readFileSync(new URL("../.github/workflows/quota-watch.yml", import.meta.url), "utf8");

test("quota-watch runs daily at 04:07 KST and can be triggered by hand", () => {
  // 19:07 UTC = 04:07 KST 다음 날. 정각을 피해 러너 혼잡을 비킨다.
  assert.match(quotaWatch, /cron: "7 19 \* \* \*"/);
  assert.match(quotaWatch, /workflow_dispatch:/);
  assert.match(quotaWatch, /group: quota-watch/, "동시 실행이 겹치면 이슈가 둘 생긴다");
});

test("quota-watch reads the providers it claims to read", () => {
  assert.match(quotaWatch, /LYRA_SITE_URL/);
  assert.match(quotaWatch, /secrets\.NEON_API_KEY/);
  assert.match(quotaWatch, /node scripts\/quota-watch\.mjs/);
  assert.match(quotaWatch, /GITHUB_STEP_SUMMARY/, "리포트는 요약에 남아야 사람이 본다");
});

test("quota-watch updates an open alert instead of stacking new ones", () => {
  // 매일 도는 워크플로라 무조건 create하면 한 달에 서른 개가 쌓인다
  assert.match(quotaWatch, /gh issue list --state open/);
  assert.match(quotaWatch, /gh issue comment/);
  assert.match(quotaWatch, /gh issue create/);
  assert.match(quotaWatch, /permissions:[\s\S]*issues: write/);
});

test("quota-watch reports before it fails", () => {
  // 점검 단계가 즉시 죽으면 리포트가 요약에 남지 않는다 — 왜 경보인지 모른 채
  // 실패 메일만 온다. 수집은 continue-on-error로 받고 마지막에 실패시킨다.
  const watchStep = quotaWatch.slice(quotaWatch.indexOf("id: watch"), quotaWatch.indexOf("요약에 리포트"));
  assert.match(watchStep, /continue-on-error: true/);
  assert.match(quotaWatch, /if: always\(\)[\s\S]*GITHUB_STEP_SUMMARY/);
  assert.match(quotaWatch, /exit 1/, "경보면 워크플로는 실패로 끝나야 알림이 간다");
});
