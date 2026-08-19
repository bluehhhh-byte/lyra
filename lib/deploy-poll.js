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
