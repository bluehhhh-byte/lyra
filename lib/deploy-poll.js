// 배포 상태 폴링 일정 — 클라이언트와 테스트가 같은 숫자를 본다.
//
// 예전에는 3초 고정 × 최대 100회 = 5분에 조회 100번이었다. 빌드는 보통 3~5분
// 걸리므로 앞쪽의 촘촘한 조회는 거의 전부 헛돈다. 처음엔 빠르게(금방 끝나는
// 변경을 놓치지 않게), 이후엔 느리게 — 5분 동안 최대 15회로 묶는다.
export const POLL_DELAYS_MS = [3000, 5000, 8000, 13000, 20000, 30000];
export const MAX_POLLS = 15;
export const MAX_ELAPSED_MS = 5 * 60_000;

export const delayAt = (i) => POLL_DELAYS_MS[Math.min(i, POLL_DELAYS_MS.length - 1)];

// i번째 조회까지의 누적 대기 시간
export const elapsedAt = (i) => {
  let sum = 0;
  for (let k = 0; k < i; k++) sum += delayAt(k);
  return sum;
};

// 진행 중 작업을 어떻게 따라갈지 — 클라이언트 폴링 루프의 다음 걸음.
// deploymentId가 아직 없는 in-progress(다른 탭이 claim만 하고 Vercel 생성 전)는
// 장부를 다시 조회해야 한다. 예전에는 이 구간에서 화면이 BUILDING에 고착됐다.
export function trackPlan(job) {
  if (!job) return { step: "give-up", reason: "장부에 진행 중인 작업이 없습니다" };
  if (job.status === "READY") return { step: "done" };
  if (job.status === "ERROR" || job.status === "CANCELED")
    return { step: "error", reason: job.error || "배포가 실패했습니다" };
  if (job.status === "BUILDING" && job.deploymentId)
    return { step: "poll-deployment", id: job.deploymentId };
  if (job.status === "BUILDING") return { step: "poll-ledger" };
  return { step: "give-up", reason: `알 수 없는 상태: ${job.status}` };
}
