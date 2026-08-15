// 여러 파일을 한 커밋으로 묶는 경로 — 커밋 수가 곧 배포 수이고, 배포가 몰리면
// GitHub 남용 탐지에 걸린다(2026-08-15에 실제로 계정 이벤트 발화가 멈췄다).
//   node lib/store.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 로컬(파일시스템) 경로 검증 — GITHUB_* 없이 불러오면 useGit=false다
{
  const { commitFiles } = await import("./store.js");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-store-"));
  const cwd = process.cwd();
  process.chdir(tmp);
  try {
    await commitFiles(
      [
        { path: "songs/a.md", content: "A" },
        { path: "songs/b.md", content: "B" },
        { path: "data/x.json", content: "{}" },
      ],
      "test"
    );
    assert.equal(fs.readFileSync(path.join(tmp, "songs/a.md"), "utf8"), "A");
    assert.equal(fs.readFileSync(path.join(tmp, "songs/b.md"), "utf8"), "B");
    assert.equal(fs.readFileSync(path.join(tmp, "data/x.json"), "utf8"), "{}", "없던 디렉터리도 만든다");

    // content가 null이면 삭제
    await commitFiles([{ path: "songs/a.md", content: null }], "delete");
    assert.equal(fs.existsSync(path.join(tmp, "songs/a.md")), false);
    assert.equal(fs.existsSync(path.join(tmp, "songs/b.md")), true, "지정하지 않은 파일은 그대로");

    // 빈 목록은 아무것도 하지 않는다
    assert.equal(await commitFiles([], "noop"), null);

    // 저장소 밖으로 나가는 경로는 막는다
    for (const bad of ["../evil.md", "songs/../../evil.md", "/etc/passwd"])
      await assert.rejects(() => commitFiles([{ path: bad, content: "x" }], "m"), /저장소 밖 경로/, bad);
  } finally {
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
console.log("✓ 배치 커밋 — 로컬 쓰기·삭제·경로 차단");

// 일괄 작업이 곡마다 커밋하지 않는다. 예전에는 루프 안에서 writeSong을 불러
// 30곡이면 커밋 30개 · 배포 30번이 나갔다.
{
  const src = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
  const bulk = src.slice(src.indexOf('action === "bulkApply"'), src.indexOf('action === "load"'));
  assert.ok(bulk.length > 100, "bulk 블록을 찾지 못했다");
  assert.ok(!/await writeSong\(/.test(bulk), "bulk가 아직 곡마다 커밋한다");
  assert.ok(/commitFiles\(/.test(bulk), "bulk가 배치 커밋을 쓰지 않는다");
}
console.log("✓ 일괄 작업은 한 커밋");
console.log("all passed");
