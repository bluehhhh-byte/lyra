// lib/*.test.mjs 를 전부 돌리고 하나라도 실패하면 비정상 종료.
// 테스트는 프레임워크 없는 assert 스크립트(실패 시 throw) — 각 파일을 자식
// 프로세스로 실행해 종료코드로 판정한다.  실행: pnpm test
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib");
const tests = readdirSync(libDir).filter((f) => f.endsWith(".test.mjs")).sort();

let failed = 0;
for (const file of tests) {
  const full = path.join(libDir, file);
  try {
    execFileSync(process.execPath, [full], { stdio: ["ignore", "ignore", "pipe"] });
    console.log(`  ✓ ${file}`);
  } catch (err) {
    failed++;
    const msg = (err.stderr?.toString() || err.message).trim().split("\n").slice(-3).join("\n");
    console.log(`  ✗ ${file}\n${msg.replace(/^/gm, "      ")}`);
  }
}

console.log(failed ? `\n${failed}/${tests.length} 실패` : `\n전체 ${tests.length}개 통과`);
process.exit(failed ? 1 : 0);
