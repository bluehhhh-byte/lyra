import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/backup.yml", import.meta.url), "utf8");

test("daily backup dumps once and creates one atomic commit", () => {
  assert.match(workflow, /cron: "17 18 \* \* \*"/);
  assert.match(workflow, /node \.\.\/scripts\/dump-content\.mjs/);
  assert.equal((workflow.match(/git commit /g) || []).length, 1);
  assert.match(workflow, /git add -A -- songs movies data \.backup-manifest\.json/, "다음 덤프가 바뀐 행만 받으려면 manifest도 커밋한다");
});

test("backups go to the private repository, not this public one", () => {
  // 공개 저장소에 커밋하면 가사·번역 전문이 매일 공개 이력에 남는다
  assert.match(workflow, /repository: bluehhhh-byte\/lyra-backup/);
  assert.match(workflow, /ssh-key: \$\{\{ secrets\.BACKUP_DEPLOY_KEY \}\}/);
  assert.match(workflow, /permissions:\n  contents: read/, "이 저장소에는 쓰지 않는다");
  const commitStep = workflow.slice(workflow.indexOf("Commit one atomic snapshot"), workflow.indexOf("Open or update the alert issue"));
  assert.match(commitStep, /working-directory: backup/, "커밋은 비공개 저장소 체크아웃 안에서만");
  const dumpStep = workflow.slice(workflow.indexOf("Dump Neon content"), workflow.indexOf("Verify the dump"));
  assert.match(dumpStep, /working-directory: backup/);
});

test("backup uses a dated tag and never force-pushes", () => {
  assert.match(workflow, /tag="db-backup-/);
  assert.match(workflow, /git push origin HEAD "refs\/tags\/\$tag"/);
  assert.doesNotMatch(workflow, /git push[^\n]*(?:--force|-f\b)/);
});

test("the dump reads only rows that changed since the last backup", () => {
  const dump = fs.readFileSync(new URL("../scripts/dump-content.mjs", import.meta.url), "utf8");
  assert.match(dump, /select kind, slug, md5\(raw\) as h from lyra_contents/, "먼저 해시만 받는다");
  assert.match(dump, /where kind \|\| '\/' \|\| slug = any\(\$\{needContent\}\)/, "본문은 바뀐 행만");
  assert.match(dump, /\.backup-manifest\.json/);
  const verified = dump.slice(dump.indexOf("검증 완료"));
  assert.match(verified, /fs\.writeFileSync\(MANIFEST/, "manifest는 검증을 통과한 뒤에만 갱신한다");
});
