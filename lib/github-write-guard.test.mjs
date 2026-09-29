// GitHub 쓰기 안전장치 — 계정 abuse 제한(2026-08, 티켓 #4667653) 재발 방지.
//   node lib/github-write-guard.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { githubWritesAllowed, reserveGitHubWrite, GITHUB_WRITE_LIMITS } from "./github-write-guard.js";

// 명시적으로 켜야만 쓴다
assert.equal(githubWritesAllowed({}), false);
assert.equal(githubWritesAllowed({ LYRA_ALLOW_GITHUB_WRITES: "0" }), false);
assert.equal(githubWritesAllowed({ LYRA_ALLOW_GITHUB_WRITES: "true" }), false, "1만 허용 — 애매한 값은 끈다");
assert.equal(githubWritesAllowed({ LYRA_ALLOW_GITHUB_WRITES: "\uFEFF1 " }), true);

// 간격과 시간당 상한
{
  const log = [];
  const t0 = 1_000_000;
  reserveGitHubWrite({ now: t0, log });
  assert.throws(() => reserveGitHubWrite({ now: t0 + 1_000, log }), /간격/, "반복문이 연달아 쓰면 멈춘다");
  let t = t0;
  for (let i = 1; i < GITHUB_WRITE_LIMITS.maxPerHour; i++) reserveGitHubWrite({ now: (t += GITHUB_WRITE_LIMITS.minIntervalMs), log });
  assert.throws(() => reserveGitHubWrite({ now: t + GITHUB_WRITE_LIMITS.minIntervalMs, log }), /상한/);
  reserveGitHubWrite({ now: t0 + 60 * 60 * 1000 + 1, log }); // 한 시간이 지나면 다시 된다
}

// store.js의 모든 GitHub 쓰기가 안전장치를 거친다
const store = fs.readFileSync(new URL("./store.js", import.meta.url), "utf8");
assert.match(store, /const useGit = [^\n]*githubWritesAllowed\(\)/, "로컬에서도 켜야만 GitHub에 쓴다");
const writes = (store.match(/gh\("PUT"|gh\("DELETE"|method: "PUT"|\$\{api\}\/trees/g) || []).length;
const guards = (store.match(/reserveGitHubWrite\(\)/g) || []).length;
assert.equal(writes, 4, "GitHub 쓰기 지점이 늘었으면 여기와 안전장치를 함께 본다");
assert.equal(guards, 4, "쓰기 지점마다 reserveGitHubWrite()가 있어야 한다");

console.log("✓ GitHub 쓰기는 명시 허용 + 속도 제한");
