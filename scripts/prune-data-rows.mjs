// lyra_data에서 런타임이 쓰지 않는 행을 정리한다.
//
// migrate-content가 data/*.json을 전부 올리던 시절, .gitignore에 있는 생성 산출물
// search-index.json(2.9MB)과 playlist.json(0.35MB)까지 DB에 들어갔다. lyra_data
// 4.3MB 중 3.2MB가 그것이다. 빌드 때 다시 만들 수 있으므로 DB에 둘 이유가 없다.
//
// 기본은 dry-run이다. 무엇을 얼마나 지울지 먼저 보여주고, --apply를 붙였을 때만
// 실제로 지운다. production DB를 검증 없이 건드리지 않기 위한 것이다.
//
//   node scripts/prune-data-rows.mjs           # 대상만 출력 (기본)
//   node scripts/prune-data-rows.mjs --apply   # 실제 삭제
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local", override: false, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL이 없습니다.");
const sql = neon(url);
const apply = process.argv.includes("--apply");

// migrate-content.mjs의 DATA_ALLOWLIST와 같은 목록이어야 한다.
// 한쪽만 고치면 지운 행이 다음 migration에서 되살아나거나, 살려 둔 행이 영영 남는다.
const KEEP = new Set([
  "artwork-backfill-audit.json",
  "lyrics-corrections.json",
  "motifs.json",
  "music-report.json",
  "song-recs.json",
  "taste-recs.json",
  "taste-report.json",
  "watcha-movies.json",
  "watcha-ratings.json",
  "instagram-pending.json",
  "instagram-pending-triage.json",
  "instagram-playlists.json",
  "instagram-source-manifest.json",
  "moments.json",
]);

const rows = await sql`select name, octet_length(raw) as bytes, updated_at from lyra_data order by octet_length(raw) desc`;
const doomed = rows.filter((row) => !KEEP.has(row.name));
const kept = rows.filter((row) => KEEP.has(row.name));

const mb = (n) => (Number(n) / 1048576).toFixed(2) + "MB";
const total = (list) => list.reduce((sum, row) => sum + Number(row.bytes), 0);

console.log(`lyra_data 전체 ${rows.length}행 ${mb(total(rows))}`);
console.log(`  유지 ${kept.length}행 ${mb(total(kept))}`);
console.log(`  삭제 대상 ${doomed.length}행 ${mb(total(doomed))}`);
if (doomed.length) {
  console.log("");
  for (const row of doomed) {
    console.log(`  - ${row.name.padEnd(34)} ${mb(row.bytes).padStart(8)}  (갱신 ${new Date(row.updated_at).toISOString().slice(0, 10)})`);
  }
}

if (!doomed.length) {
  console.log("\n지울 것이 없습니다.");
} else if (!apply) {
  console.log("\n(dry-run) 실제로 지우려면 --apply를 붙이세요.");
  console.log("삭제해도 파일은 로컬 data/에 남고, 생성 산출물은 빌드로 다시 만들 수 있습니다.");
} else {
  const names = doomed.map((row) => row.name);
  const deleted = await sql`delete from lyra_data where name = any(${names}) returning name`;
  console.log(`\n${deleted.length}행을 삭제했습니다.`);
  const after = await sql`select pg_database_size(current_database())::bigint as bytes`;
  console.log(`DB 크기: ${mb(after[0].bytes)}`);
  console.log("캐시 무효화가 필요하면 node scripts/migrate-content.mjs 또는 /api/revalidate를 부르세요.");
}
