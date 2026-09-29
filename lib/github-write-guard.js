// GitHub 쓰기 안전장치.
//
// 2026-08-01 왓챠 임포트가 Contents API로 파일마다 커밋을 만들어 11분에 1,059커밋이
// 생겼고, 계정이 abuse 플래그에 걸려 모든 저장소가 3주 넘게 비공개 취급(404)됐다
// (지원 티켓 #4667653). 운영(production)은 Neon만 쓰므로 그 경로가 닫혀 있지만,
// 로컬 개발 서버는 GITHUB_TOKEN·GITHUB_REPO만 있으면 같은 경로가 그대로 열렸다.
//
// 그래서 두 겹으로 막는다.
//   1) 명시적 허용: LYRA_ALLOW_GITHUB_WRITES=1 이 아니면 GitHub에 쓰지 않는다
//      (로컬 파일에 쓴다 — 개발에는 그걸로 충분하다).
//   2) 속도 제한: 허용해도 한 프로세스에서 쓰기 사이 최소 간격과 시간당 상한을 둔다.
//      넘으면 조용히 기다리지 않고 실패한다 — 반복문이 제한을 모른 채 계속 돌지 않게.

export const GITHUB_WRITE_LIMITS = { minIntervalMs: 30_000, maxPerHour: 20 };
const HOUR_MS = 60 * 60 * 1000;

export function githubWritesAllowed(env = process.env) {
  return String(env.LYRA_ALLOW_GITHUB_WRITES ?? "").replace(/^\uFEFF/, "").trim() === "1";
}

const defaultLog = [];

// 쓰기 직전에 부른다. 통과하면 기록을 남기고, 넘으면 이유를 담아 던진다.
export function reserveGitHubWrite({ now = Date.now(), log = defaultLog, limits = GITHUB_WRITE_LIMITS } = {}) {
  while (log.length && now - log[0] >= HOUR_MS) log.shift();
  if (log.length >= limits.maxPerHour) {
    throw new Error(
      `GitHub 쓰기 상한(1시간에 ${limits.maxPerHour}번)에 닿았습니다. 대량 작업은 Neon에 저장하거나 ` +
        "여러 파일을 commitFiles 한 번(커밋 하나)으로 묶으세요 — 파일마다 커밋하면 계정이 다시 제한될 수 있습니다."
    );
  }
  const last = log[log.length - 1];
  if (last !== undefined && now - last < limits.minIntervalMs) {
    const wait = Math.ceil((limits.minIntervalMs - (now - last)) / 1000);
    throw new Error(`GitHub 쓰기 간격이 너무 짧습니다 — ${wait}초 뒤에 다시 하세요(최소 ${limits.minIntervalMs / 1000}초).`);
  }
  log.push(now);
}
