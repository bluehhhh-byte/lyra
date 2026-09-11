import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SHRINK_RATIO,
  SMALL_CORPUS,
  checkBackupIntegrity,
  renderBackupReport,
} from "./backup-integrity.js";

test("a normal day, where the archive only grows, passes", () => {
  const result = checkBackupIntegrity({ songs: 967, movies: 50 }, { songs: 966, movies: 50 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test("a small, ordinary correction passes", () => {
  // 중복 한둘을 지운 날까지 막으면 백업이 매번 멈춘다
  const result = checkBackupIntegrity({ songs: 960, movies: 50 }, { songs: 966, movies: 50 });
  assert.equal(result.ok, true);
});

test("losing more than a fifth stops the backup", () => {
  const result = checkBackupIntegrity({ songs: 700, movies: 50 }, { songs: 966, movies: 50 });
  assert.equal(result.ok, false);
  assert.match(result.findings[0], /966개에서 700개로/);
  assert.match(result.findings[0], /27\.5%/);
});

test("an empty dump is an accident at any size", () => {
  // 비율만 보면 작은 컬렉션의 전멸을 놓친다 — 0은 따로 잡는다
  const result = checkBackupIntegrity({ songs: 966, movies: 0 }, { songs: 966, movies: 5 });
  assert.equal(result.ok, false);
  assert.match(result.findings[0], /영화이 5개에서 0개/);
  assert.match(result.findings[0], /빈 DB/);
});

test("a tiny corpus is judged by disappearance, not by ratio", () => {
  // 3 → 2는 33% 감소지만 사고가 아니다
  const small = checkBackupIntegrity({ songs: 966, movies: 2 }, { songs: 966, movies: 3 });
  assert.equal(small.ok, true);
  assert.ok(SMALL_CORPUS >= 3);
});

test("a first run with no previous backup cannot fail", () => {
  const result = checkBackupIntegrity({ songs: 966, movies: 50 }, {});
  assert.equal(result.ok, true, "비교 대상이 없으면 판단하지 않는다");
});

test("the threshold is adjustable for a planned cleanup", () => {
  const strict = checkBackupIntegrity({ songs: 900, movies: 50 }, { songs: 966, movies: 50 });
  assert.equal(strict.ok, true, "6.8% 감소는 기본 허용치 안");
  const paranoid = checkBackupIntegrity({ songs: 900, movies: 50 }, { songs: 966, movies: 50 }, { maxShrink: 0.05 });
  assert.equal(paranoid.ok, false);
  assert.equal(MAX_SHRINK_RATIO, 0.2);
});

test("the report shows both counts and says what was not done", () => {
  const bad = checkBackupIntegrity({ songs: 100, movies: 50 }, { songs: 966, movies: 50 });
  const report = renderBackupReport(bad);
  assert.match(report, /\*\*중단\*\*/);
  assert.match(report, /백업을 커밋하지 않았습니다/);
  assert.match(report, /\| 곡 \| 966 \| 100 \|/);
  assert.match(report, /어제 백업은 그대로 두었습니다/, "무엇이 살아 있는지 알려야 사람이 안심한다");
  assert.match(report, /--allow-shrink/, "의도한 감소일 때 빠져나갈 길을 알려준다");

  const good = renderBackupReport(checkBackupIntegrity({ songs: 967, movies: 50 }, { songs: 966, movies: 50 }));
  assert.match(good, /이상 없음/);
  assert.doesNotMatch(good, /사유/);
});
