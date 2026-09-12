// 무엇이 Neon 전송량을 태우는지 읽는다. LYRA_USAGE_METRICS=on으로 하루 켜 둔 뒤
// 이 스크립트로 결과를 본다.
//
// 왜 필요한가: 2026-08-17 → 08-22 → 09-12로 프로젝트가 두 번 갈렸다. 매번 월
// 전송 5GB를 3주 만에 태웠고, 그때마다 새 프로젝트로 옮겨 3주를 벌었다. 설계
// 예상치는 6시간 캐시 기준 월 0.6GB인데 실제는 12배다. 그 차이를 설명하지 못하면
// 다음 달에도 같은 날이 온다.
//
// 무엇을 보는가:
//   1. 5분 버킷별 Neon 읽기 횟수 — 하루 4회여야 하는데 몇 번인가
//   2. 경로별 캐시 HIT/MISS — 어느 화면이 캐시를 빗나가는가
//   3. 읽기당 평균 바이트 — 한 번에 얼마를 끌어오는가
//
//   node scripts/read-usage-metering.mjs [--hours 24]
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readUsageSeries, readUsagePaths } from "../lib/usage-metrics-db.js";

dotenv.config({ path: ".env.local", quiet: true });
const at = process.argv.indexOf("--hours");
const HOURS = at > 0 ? Number(process.argv[at + 1]) : 24;
const sql = neon(process.env.DATABASE_URL);

const mb = (n) => `${(Number(n || 0) / 1e6).toFixed(1)}MB`;

const series = await readUsageSeries(sql, HOURS);
if (!series.length) {
  console.log(`최근 ${HOURS}시간 계측 기록이 없습니다. LYRA_USAGE_METRICS=on 이후 배포가 있었는지 확인하세요.`);
  process.exit(0);
}

const reads = series.reduce((a, r) => a + Number(r.neon_reads || 0), 0);
const bytes = series.reduce((a, r) => a + Number(r.neon_transfer_bytes || 0), 0);
const buckets = series.length;
const active = series.filter((r) => Number(r.neon_reads || 0) > 0).length;

console.log(`# 최근 ${HOURS}시간 Neon 읽기\n`);
console.log(`  총 읽기      ${reads}회`);
console.log(`  총 전송      ${mb(bytes)}  (읽기당 평균 ${mb(reads ? bytes / reads : 0)})`);
console.log(`  하루 환산    ${mb((bytes / HOURS) * 24)} → 월 ${((bytes / HOURS) * 24 * 30 / 1e9).toFixed(2)}GB`);
console.log(`  읽기가 있던 5분 버킷 ${active} / ${buckets}`);
// 6시간 캐시대로면 하루 4번, 24시간이면 버킷 288개 중 4개에만 읽기가 있어야 한다.
const expected = Math.max(1, Math.round(HOURS / 6));
console.log(`  (캐시 설계대로면 ${expected}회 안팎이어야 한다 — ${reads > expected * 3 ? "⚠ 크게 초과" : "정상 범위"})`);

console.log(`\n## 읽기가 몰린 시각 (상위 10)`);
[...series]
  .sort((a, b) => Number(b.neon_reads || 0) - Number(a.neon_reads || 0))
  .slice(0, 10)
  .filter((r) => Number(r.neon_reads || 0) > 0)
  .forEach((r) => console.log(`  ${String(r.bucket).slice(0, 16)}  읽기 ${String(r.neon_reads).padStart(4)}회 · ${mb(r.neon_transfer_bytes)}`));

const paths = await readUsagePaths(sql, HOURS).catch(() => []);
if (paths.length) {
  console.log(`\n## 경로별 요청 (캐시 상태별)`);
  const miss = paths.filter((p) => !/HIT/i.test(String(p.cache_status)));
  for (const p of paths.slice(0, 15))
    console.log(`  ${String(p.views).padStart(6)}회  ${String(p.cache_status).padEnd(10)}  ${p.path}`);
  const missTotal = miss.reduce((a, p) => a + Number(p.views || 0), 0);
  const all = paths.reduce((a, p) => a + Number(p.views || 0), 0);
  console.log(`\n  캐시 빗나감 ${missTotal} / ${all} (${all ? ((missTotal / all) * 100).toFixed(1) : 0}%)`);
}

console.log(`\n계측은 읽기마다 upsert를 하나 더 붙인다 — 원인을 찾으면 LYRA_USAGE_METRICS를 지워라.`);
