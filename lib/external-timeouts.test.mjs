import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 시한 없는 fetch 하나가 서버리스 함수를 최대 실행 시간까지 붙들고 있으면
// 그 시간이 통째로 무료 한도에서 나간다. 공급자가 대답을 안 하는 것은 흔한
// 일이라(TMDB·iTunes·lrclib·Deezer·Gemini 전부 겪었다) 새 호출이 시한 없이
// 들어오면 여기서 막는다.
//
// 정적 검사라 오탐이 있을 수 있다 — 그래서 목록으로 빠져나갈 길을 둔다.
// 다만 추가할 때는 왜 시한이 필요 없는지 한 줄로 적는다.
// "use client" 파일은 목록으로 관리하지 않고 자동으로 뺀다. 브라우저에서 도는
// fetch는 탭이 닫히면 끝나고 서버리스 실행 시간을 쓰지 않는다 — 목록을 손으로
// 채우면 컴포넌트를 하나 만들 때마다 이 테스트가 틀리게 실패한다.
const isClientModule = (source) => /^\s*(?:\/\/[^\n]*\n\s*)*["']use client["']/.test(source);

// 서버에서 도는데도 시한이 필요 없는 진짜 예외만 여기 적는다.
const ALLOW = new Map();

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const SKIP_DIR = /node_modules|[\\/]vendor[\\/]|\.next/;

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP_DIR.test(full)) continue;
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(js|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

// 강제 대상은 서버리스에서 도는 코드다. scripts/는 이 컴퓨터에서 돌기 때문에
// 매달린 fetch가 성가시긴 해도 무료 한도를 태우지는 않는다 — 아래 두 번째
// 테스트가 그쪽은 실패시키지 않고 세기만 한다.
test("every fetch that runs on the serverless side carries a timeout", () => {
  const roots = ["lib", "app"].map((d) => path.join(root, d)).filter((d) => fs.existsSync(d));
  const offenders = [];
  for (const file of roots.flatMap(sourceFiles)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const source = fs.readFileSync(file, "utf8");
    if (isClientModule(source)) continue;
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      // fetchImpl / fetchImpl( 같은 주입 지점과 정의는 호출이 아니다
      if (!/(?<![A-Za-z.])fetch\(/.test(line)) return;
      if (line.trimStart().startsWith("//")) return;
      // 호출 한 건이 여러 줄에 걸친다 — 뒤 몇 줄까지 함께 본다
      const window = lines.slice(index, index + 8).join(" ");
      if (/AbortSignal\.timeout|signal:|timeoutMs/.test(window)) return;
      if (ALLOW.has(rel)) return;
      offenders.push(`${rel}:${index + 1}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `시한 없는 fetch가 있습니다. AbortSignal.timeout을 걸거나, 정말 필요 없으면 ALLOW에 사유와 함께 등록하세요:\n${offenders.join("\n")}`,
  );
});

test("the allowlist stays honest — every entry names a file that exists and a reason", () => {
  for (const [file, reason] of ALLOW) {
    assert.ok(fs.existsSync(path.join(root, file)), `허용 목록에 없는 파일이 남아 있습니다: ${file}`);
    assert.ok(reason.length > 5, `${file}: 사유를 적어야 합니다`);
  }
});

test("local scripts are counted, not policed", () => {
  // 로컬에서 도는 코드라 실패시키지 않는다. 다만 수치가 크게 늘면 눈에 띄도록
  // 상한을 둔다 — 새 스크립트를 쓸 때 시한을 거는 편이 기본이 되게.
  const dir = path.join(root, "scripts");
  if (!fs.existsSync(dir)) return;
  let missing = 0;
  for (const file of sourceFiles(dir)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!/(?<![A-Za-z.])fetch\(/.test(line) || line.trimStart().startsWith("//")) return;
      if (!/AbortSignal\.timeout|signal:/.test(lines.slice(index, index + 8).join(" "))) missing++;
    });
  }
  assert.ok(missing <= 40, `시한 없는 스크립트 fetch가 ${missing}건으로 늘었습니다 — 새로 쓰는 것부터 시한을 거세요.`);
});

test("the providers that have actually timed out on us keep their timeouts", () => {
  // 회귀로 사라지면 가장 아픈 곳들 — 각각 실제로 한 번씩 겪었다
  for (const file of ["lib/tmdb.js", "lib/admin/itunes.js", "lib/admin/lrclib.js", "lib/admin/gemini.js"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /AbortSignal\.timeout|signal:/, `${file}에 시한이 없습니다`);
  }
});
