// 대량 작업이 파일을 쓰기 전에 확인하는 것들.
//
// 배포된 admin은 GitHub API로 main에 바로 커밋하고, 그동안 로컬에서 대량 작업이
// 돌면 서로 덮어쓴다. 이번에 실제로 겪었다 — 자동수정 커밋과 독음 작업이 겹쳐
// 리베이스 충돌이 났고, 정리 스크립트가 멀쩡한 번역까지 지웠다.
// 그래서 쓰기 전에 "지금 여기서 써도 되는 상태인가"를 묻는다.
import { execFileSync } from "child_process";

const git = (...a) => {
  try { return execFileSync("git", a, { encoding: "utf8" }).trim(); }
  catch { return ""; }
};

export function repoState() {
  return {
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    dirty: git("status", "--porcelain").split("\n").filter(Boolean).length,
    behind: Number(git("rev-list", "--count", "HEAD..@{upstream}") || 0),
    ahead: Number(git("rev-list", "--count", "@{upstream}..HEAD") || 0),
  };
}

// 대량 쓰기 전에 부른다. 막을 이유가 있으면 사유 배열을 돌려준다.
//   allowMain: main에서 돌리는 걸 허용할지 (기본 false — worktree 권장)
export function preflight({ allowMain = false, allowDirty = true } = {}) {
  const s = repoState();
  const stop = [];
  if (!allowMain && s.branch === "main")
    stop.push("main에서 대량 작업을 돌리려 합니다 — admin 자동 커밋과 겹칩니다. node scripts/worktree.mjs new <이름>");
  if (s.behind)
    stop.push(`원격보다 ${s.behind}커밋 뒤처져 있습니다 — git pull --rebase 후 다시 시작하세요`);
  if (!allowDirty && s.dirty)
    stop.push(`커밋하지 않은 변경 ${s.dirty}건이 있습니다`);
  return { ...s, stop };
}

// CLI 스크립트용 — 막히면 이유를 찍고 종료한다. --force로 넘어갈 수 있다.
export function guard(opts = {}) {
  const force = process.argv.includes("--force");
  const r = preflight(opts);
  if (!r.stop.length) return r;
  console.error("중단 — 지금 여기서 쓰면 다른 작업과 겹칩니다:");
  for (const s of r.stop) console.error(`  · ${s}`);
  if (force) { console.error("  (--force 로 계속합니다)"); return r; }
  console.error("  확인했고 그래도 진행하려면 --force");
  process.exit(1);
}
