// 배포 장부 — 같은 커밋은 한 번만, 동시에 하나만, 죽은 작업은 lease로 복구.
// 예전에는 중복 방지가 브라우저 useRef 하나뿐이라 두 탭이 각각 배포를 만들었다.
// (인메모리 경로로 의미를 검증한다. Neon 경로는 같은 결정을 SQL 원자 연산 —
//  PK upsert + BUILDING 부분 유니크 인덱스 — 로 내린다.)
import assert from "node:assert/strict";
import { claimDeploy, attachDeployment, finishDeploy, currentDeployJob, renewDeployLease, _resetMemory, LEASE_MINUTES } from "./deploy-jobs.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

// 같은 SHA의 동시 요청 — 하나만 claimed, 나머지는 in-progress
{
  _resetMemory();
  const results = await Promise.all([claimDeploy(SHA_A), claimDeploy(SHA_A), claimDeploy(SHA_A)]);
  const kinds = results.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["claimed", "in-progress", "in-progress"], "동시 3건 중 하나만 배포를 만든다");
}

// 다른 SHA라도 하나가 빌드 중이면 새 배포를 만들지 않는다 — 전역 단일 실행
{
  _resetMemory();
  assert.equal((await claimDeploy(SHA_A)).kind, "claimed");
  assert.equal((await claimDeploy(SHA_B)).kind, "busy", "다른 커밋도 동시에 빌드하지 않는다");
}

// READY가 된 SHA는 다시 배포하지 않는다
{
  _resetMemory();
  await claimDeploy(SHA_A);
  await attachDeployment(SHA_A, "dpl_x1");
  await finishDeploy(SHA_A, { ok: true });
  const again = await claimDeploy(SHA_A);
  assert.equal(again.kind, "already-deployed");
  assert.equal(again.job.deploymentId, "dpl_x1");
  // 새 커밋은 배포할 수 있다
  assert.equal((await claimDeploy(SHA_B)).kind, "claimed");
}

// 실패한 SHA는 재시도할 수 있다
{
  _resetMemory();
  await claimDeploy(SHA_A);
  await finishDeploy(SHA_A, { ok: false, error: "빌드 실패" });
  assert.equal((await claimDeploy(SHA_A)).kind, "claimed", "ERROR는 잠금이 아니다");
}

// lease 만료 — 함수가 죽어 BUILDING이 방치돼도 10분 뒤 복구된다
{
  _resetMemory();
  const realNow = Date.now;
  let t = 1_000_000_000_000;
  Date.now = () => t;
  try {
    assert.equal((await claimDeploy(SHA_A)).kind, "claimed");
    t += (LEASE_MINUTES - 1) * 60_000;
    assert.equal((await claimDeploy(SHA_B)).kind, "busy", "lease가 살아 있는 동안은 잠긴다");
    t += 2 * 60_000; // lease 만료
    assert.equal((await claimDeploy(SHA_B)).kind, "claimed", "만료된 BUILDING은 복구되고 잠금이 풀린다");
    const dead = await claimDeploy(SHA_A);
    assert.equal(dead.kind, "busy", "복구된 SHA_A는 ERROR — 지금은 SHA_B가 빌드 중");
  } finally {
    Date.now = realNow;
  }
}

// 화면 재진입 — 진행 중 작업을 돌려준다
{
  _resetMemory();
  await claimDeploy(SHA_A);
  await attachDeployment(SHA_A, "dpl_y2");
  const job = await currentDeployJob();
  assert.equal(job.status, "BUILDING");
  assert.equal(job.deploymentId, "dpl_y2");
}

console.log("✓ 배포 장부 — dedupe·전역 잠금·lease 복구");

// heartbeat — 빌드가 10분을 넘어도 폴링이 lease를 밀어 주는 한 잠금은 산다.
// heartbeat가 끊긴 경우에만 만료 복구가 일어난다.
{
  _resetMemory();
  const realNow = Date.now;
  let t = 2_000_000_000_000;
  Date.now = () => t;
  try {
    await claimDeploy(SHA_A);
    await attachDeployment(SHA_A, "dpl_hb");
    // 25분 동안 5분마다 heartbeat — 고정 lease(10분)였다면 진작 만료됐을 시간
    for (let k = 0; k < 5; k++) {
      t += 5 * 60_000;
      await renewDeployLease(SHA_A, "dpl_hb");
      assert.equal((await claimDeploy(SHA_B)).kind, "busy", `${(k + 1) * 5}분 경과 — heartbeat가 살아 있으면 잠금 유지`);
    }
    // heartbeat 중단 → lease 시한 뒤 복구
    t += LEASE_MINUTES * 60_000 + 1;
    assert.equal((await claimDeploy(SHA_B)).kind, "claimed", "heartbeat가 끊긴 뒤에만 잠금이 풀린다");
  } finally {
    Date.now = realNow;
  }
}

// heartbeat 대상 검증 — 다른 deploymentId·끝난 행은 밀리지 않는다
{
  _resetMemory();
  const realNow = Date.now;
  let t = 3_000_000_000_000;
  Date.now = () => t;
  try {
    await claimDeploy(SHA_A);
    await attachDeployment(SHA_A, "dpl_real");
    t += 5 * 60_000;
    await renewDeployLease(SHA_A, "dpl_other"); // 남의 id — 무시돼야 한다
    t += LEASE_MINUTES * 60_000 - 4 * 60_000; // 최초 lease(10분) 초과 지점
    assert.equal((await claimDeploy(SHA_B)).kind, "claimed", "엉뚱한 id의 heartbeat는 lease를 밀지 못한다");
  } finally {
    Date.now = realNow;
  }
}

// currentDeployJob도 만료를 정리한다 — claim 없이 화면만 다시 열어도 상태가 현재형이다
{
  _resetMemory();
  const realNow = Date.now;
  let t = 4_000_000_000_000;
  Date.now = () => t;
  try {
    await claimDeploy(SHA_A);
    t += LEASE_MINUTES * 60_000 + 1;
    const job = await currentDeployJob();
    assert.equal(job.status, "ERROR", "만료된 BUILDING은 조회만 해도 ERROR로 정리된다");
    assert.match(job.error, /시한을 넘겨/);
  } finally {
    Date.now = realNow;
  }
}

// 경계 시각 — lease_expires_at과 now가 정확히 같으면 아직 살아 있다 (< 만 만료)
{
  _resetMemory();
  const realNow = Date.now;
  let t = 5_000_000_000_000;
  Date.now = () => t;
  try {
    await claimDeploy(SHA_A);
    t += LEASE_MINUTES * 60_000; // 정확히 경계
    assert.equal((await currentDeployJob()).status, "BUILDING", "경계 시각에는 만료가 아니다");
    assert.equal((await claimDeploy(SHA_B)).kind, "busy");
    t += 1; // 경계 + 1ms
    assert.equal((await currentDeployJob()).status, "ERROR", "경계를 지나면 만료다");
  } finally {
    Date.now = realNow;
  }
}

// finish는 lease를 지운다 — 끝난 행의 시한이 읽는 쪽을 헷갈리게 하지 않게
{
  _resetMemory();
  await claimDeploy(SHA_A);
  await finishDeploy(SHA_A, { ok: true });
  const realNow = Date.now;
  Date.now = () => realNow() + LEASE_MINUTES * 60_000 * 2;
  try {
    assert.equal((await currentDeployJob()).status, "READY", "READY는 시간이 지나도 READY다");
  } finally {
    Date.now = realNow;
  }
}

console.log("OK: heartbeat·stale 정리·경계·lease 해제 (인메모리 경로 — SQL 경로는 같은 의미의 원자 연산이지만 자동 테스트 밖이다)");
