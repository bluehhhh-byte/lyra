import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const BASE_COMMIT = "1d767b723705c48322ac0a61d273ee3977026cc2";
const mode = process.argv[2];

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function latestInstagramExport() {
  const downloads = path.join(os.homedir(), "Downloads");
  if (!fs.existsSync(downloads)) return "";
  return fs.readdirSync(downloads, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("instagram-lyra.syno-"))
    .map((entry) => ({
      path: path.join(downloads, entry.name),
      mtime: fs.statSync(path.join(downloads, entry.name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.path || "";
}

if (mode === "--instagram") {
  const exportDir = process.argv[3] || process.env.LYRA_INSTAGRAM_EXPORT || latestInstagramExport();
  if (!exportDir) {
    console.error("Instagram 내보내기 폴더를 찾지 못했습니다. 경로 또는 LYRA_INSTAGRAM_EXPORT를 지정하세요.");
    process.exit(1);
  }
  const result = spawnSync(process.execPath, ["scripts/verify-instagram.mjs", exportDir], { encoding: "utf8" });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0 || !/오류 0(?:\s|·|$)/.test(result.stdout || "")) process.exit(1);
  console.log("Instagram 원문 대조 완료: 오류 0");
} else if (mode === "--worktree") {
  const status = git("status", "--porcelain");
  if (status) {
    console.error(status);
    process.exit(1);
  }
  console.log("작업 트리 완료: 추적 및 미추적 변경 0");
} else if (mode === "--source-hash") {
  try {
    git("cat-file", "-e", `${BASE_COMMIT}^{commit}`);
  } catch {
    console.error(`기준 커밋을 찾지 못했습니다: ${BASE_COMMIT}`);
    process.exit(1);
  }
  const changed = new Set([
    ...git("diff", "--name-only", BASE_COMMIT, "--", "songs").split(/\r?\n/),
    ...git("ls-files", "--others", "--exclude-standard", "--", "songs").split(/\r?\n/),
  ].filter(Boolean));
  const patch = git("diff", "--unified=0", BASE_COMMIT, "--", "songs");
  const sourceHashChanges = patch.split(/\r?\n/).filter((line) => /^[+-]source_hash:/.test(line)).length;
  if (changed.size || sourceHashChanges) {
    console.error(`원문 보존 실패: 곡 파일 변경 ${changed.size} · source_hash 변경 ${sourceHashChanges}`);
    process.exit(1);
  }
  console.log("원문 보존 완료: 곡 파일 변경 0 · source_hash 변경 0");
} else {
  console.error("사용법: node scripts/verify-e-to-j-completion.mjs --instagram [내보내기 폴더] | --worktree | --source-hash");
  process.exit(1);
}
