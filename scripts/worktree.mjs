// 동시에 여러 곳이 같은 저장소를 만지는 걸 막는다.
//   node scripts/worktree.mjs new <이름>     ../lyra-<이름>에 worktree + 브랜치 생성
//   node scripts/worktree.mjs list           현재 worktree·브랜치 상태
//   node scripts/worktree.mjs done <이름>    main에 합치고 worktree 제거
//
// 배포된 admin은 GitHub API로 main에 바로 커밋한다(그래야 Vercel이 재배포한다).
// 그래서 Claude·ChatGPT 같은 대량 작업이 main 작업 트리에서 돌면 서로를 덮어쓴다.
// 실제로 이번에 한 번 겪었다 — 다른 프로세스가 브랜치를 바꾸고 pull·push 했다.
// 대량 작업은 각자 worktree에서 하고, 끝난 뒤 한 번에 합친다.
import { execFileSync } from "child_process";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const [cmd, name] = process.argv.slice(2);

if (cmd === "list") {
  console.log(git("worktree", "list"));
  console.log("\n현재 브랜치:", git("rev-parse", "--abbrev-ref", "HEAD"));
  const dirty = git("status", "--porcelain");
  console.log(dirty ? `작업 트리 변경 ${dirty.split("\n").length}건` : "작업 트리 깨끗함");
  process.exit(0);
}

if (!name) {
  console.error("사용법: node scripts/worktree.mjs new|done <이름>");
  process.exit(1);
}
const branch = `work/${name}`;
const dir = `../lyra-${name}`;

if (cmd === "new") {
  git("fetch", "origin");
  execFileSync("git", ["worktree", "add", "-b", branch, dir, "origin/main"], { stdio: "inherit" });
  console.log(`\n${dir} 에서 작업하세요 (브랜치 ${branch}).`);
  console.log("끝나면: node scripts/worktree.mjs done " + name);
  process.exit(0);
}

if (cmd === "done") {
  const dirty = execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" }).trim();
  if (dirty) {
    console.error(`${dir}에 커밋하지 않은 변경이 있습니다 — 먼저 커밋하세요.`);
    process.exit(1);
  }
  git("checkout", "main");
  git("pull", "--rebase");
  execFileSync("git", ["merge", "--no-edit", branch], { stdio: "inherit" });
  execFileSync("git", ["worktree", "remove", dir], { stdio: "inherit" });
  git("branch", "-d", branch);
  console.log("합쳤습니다. pnpm check 후 push 하세요.");
  process.exit(0);
}

console.error(`알 수 없는 명령: ${cmd}`);
process.exit(1);
