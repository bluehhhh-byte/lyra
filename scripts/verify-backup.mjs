// 덤프 뒤, 커밋 전에 부른다. 이번 덤프가 전날 백업보다 크게 줄었으면 exit 2로
// 멈춰 세운다 — 망가진 백업으로 멀쩡한 어제 백업을 덮는 것이 이 검사가 막으려는
// 유일한 사고다.
//
//   node scripts/verify-backup.mjs                  # 덤프 후 검사
//   node scripts/verify-backup.mjs --allow-shrink   # 의도한 대량 삭제일 때
//
// exit: 0 통과 · 2 중단 · 1 검사 자체 실패
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { checkBackupIntegrity, renderBackupReport } from "../lib/backup-integrity.js";

const allowShrink = process.argv.includes("--allow-shrink");

const countDir = (dir) => {
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith(".md")).length;
  } catch {
    return 0;
  }
};

// 이전 백업 = 지금 커밋돼 있는 상태(HEAD). 덤프는 워킹 트리만 고쳤으므로
// HEAD는 아직 어제의 백업이다.
const countAtHead = (dir) => {
  try {
    // -z 필수. 기본 출력은 비ASCII 경로를 따옴표로 감싸 "songs/테이크원-개화.md"
    // 처럼 내보내는데, 그러면 .md가 아니라 .md"로 끝나 한글 제목 곡이 통째로
    // 세어지지 않는다(966곡이 509곡으로 보였다).
    const out = execFileSync("git", ["ls-tree", "--name-only", "-z", "HEAD", `${dir}/`], { encoding: "utf8" });
    return out.split("\0").filter((name) => name.endsWith(".md")).length;
  } catch {
    return 0;
  }
};

const current = { songs: countDir("songs"), movies: countDir("movies") };
const previous = { songs: countAtHead("songs"), movies: countAtHead("movies") };

// 비교 대상이 없으면(첫 백업) 판단하지 않는다
const result = checkBackupIntegrity(current, previous, allowShrink ? { maxShrink: 1 } : {});
console.log(renderBackupReport(result));

if (allowShrink && !result.ok) {
  console.log("\n--allow-shrink가 주어져 그대로 진행합니다.");
}
if (!result.ok && !allowShrink) process.exitCode = 2;
