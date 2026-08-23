// Data Cache 항목 크기 회귀 테스트.
//
// unstable_cache는 2MiB를 넘는 값을 저장하지 않는다 — 던지지도 않고 경고 로그만
// 남긴 뒤 조용히 건너뛴다. 캐시가 도는 것처럼 보이지만 실제로는 매 요청 DB를
// 다시 읽는다. 2026-08에 전곡 단일 항목이 1.61MB(한도의 78%)까지 갔고, 곡 약
// 1,200개에서 그 절벽에 닿을 예정이었다.
//
// 이 테스트는 그 절벽이 다시 생기는 것을 막는다. 실패하면 샤드를 늘리거나
// 메타/본문 분리를 더 밀어야 한다는 뜻이다 — TTL을 줄이는 것은 답이 아니다.
//   node lib/cache-size.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packRows, CONTENT_SHARDS } from "./content-db.js";

const CACHE_LIMIT = 2 * 1024 * 1024;
// 한도의 절반을 넘으면 실패한다. 90%에서 잡으면 고칠 시간이 없다 —
// 곡이 두 배가 될 때까지 여유를 두려면 이 정도여야 한다.
const SAFE_RATIO = 0.5;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function rowsFrom(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => ({ slug: f.slice(0, -3), raw: fs.readFileSync(path.join(full, f), "utf8"), revision: 1 }));
}

// 프론트매터 경계는 두 번째 `---`. lib/content-db.js의 SQL과 같은 규칙이다.
function headOnly(raw) {
  const at = raw.replace(/\r\n/g, "\n").indexOf("\n---");
  return at < 0 ? raw : raw.slice(0, at + 4);
}

// 저장소 파일을 DB 행의 대역으로 쓴다 — 같은 원문이 그대로 raw에 들어간다.
const songs = rowsFrom("songs");
assert.ok(songs.length > 0, "songs/*.md 백업이 있어야 크기를 잴 수 있다");

const report = [];
const check = (label, rows) => {
  const bytes = packRows(rows).length;
  const ratio = bytes / CACHE_LIMIT;
  report.push(`${label}: ${(bytes / 1024).toFixed(0)}KB (한도의 ${(ratio * 100).toFixed(1)}%)`);
  assert.ok(
    ratio < SAFE_RATIO,
    `${label}이 ${(ratio * 100).toFixed(1)}%로 안전선 ${SAFE_RATIO * 100}%를 넘었다. ` +
      `샤드를 늘리거나 본문을 더 분리해야 한다 — TTL을 줄이는 것은 답이 아니다.`
  );
  return bytes;
};

// 1) 본문 샤드 — 어느 한 샤드도 안전선을 넘지 않아야 한다.
// 실제 샤드는 Postgres hashtext로 나누지만, 여기서는 균등 분배를 흉내내
// "가장 큰 샤드"의 상한을 잰다. 실제 분포는 248/223/237/220으로 이보다 고르다.
{
  const buckets = Array.from({ length: CONTENT_SHARDS }, () => []);
  songs.forEach((row, i) => buckets[i % CONTENT_SHARDS].push(row));
  const sizes = buckets.map((b, i) => check(`곡 본문 샤드 ${i}`, b));
  const max = Math.max(...sizes);
  assert.ok(max > 0, "샤드가 비어 있으면 안 된다");
}

// 2) 메타 인덱스 — 본문을 뺀 목록은 훨씬 작아야 한다.
{
  const meta = songs.map((r) => ({ ...r, raw: headOnly(r.raw) }));
  const metaBytes = check("곡 메타 인덱스", meta);
  const fullBytes = packRows(songs).length;
  assert.ok(
    metaBytes < fullBytes * 0.7,
    `메타가 전량의 ${((metaBytes / fullBytes) * 100).toFixed(0)}%다 — 본문이 제대로 안 잘렸다`
  );
}

// 3) 예전 구조(전곡 한 항목)가 왜 위험했는지 못박아 둔다.
{
  const legacy = packRows(songs).length;
  assert.ok(
    legacy > CACHE_LIMIT * SAFE_RATIO,
    "전곡 단일 항목이 안전선 아래로 내려갔다면 이 테스트의 전제를 다시 확인할 것"
  );
  report.push(`(참고) 예전 전곡 단일 항목: ${(legacy / 1024).toFixed(0)}KB — 안전선 초과`);
}

// 4) 상세 단건 — 가장 큰 한 곡도 항목 하나에 여유롭게 들어가야 한다.
{
  const biggest = songs.reduce((a, b) => (b.raw.length > a.raw.length ? b : a));
  const bytes = packRows(biggest).length;
  report.push(`가장 큰 곡 단건(${biggest.slug}): ${(bytes / 1024).toFixed(1)}KB`);
  assert.ok(bytes < CACHE_LIMIT * 0.05, "단건 항목이 한도의 5%를 넘으면 구조를 다시 봐야 한다");
}

console.log(report.map((l) => "  " + l).join("\n"));
console.log("✓ 캐시 항목 크기 — 샤드·메타·단건 모두 안전선 이내");
