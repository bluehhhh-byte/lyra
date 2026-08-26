import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local", override: false, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL이 없습니다. Neon Free 연결 문자열을 .env.local에 넣으세요.");
const sql = neon(url);
const root = process.cwd();
const apply = process.argv.includes("--apply");
const verifyOnly = process.argv.includes("--verify");

const readCollection = (kind, dir) =>
  fs.readdirSync(path.join(root, dir))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({
      kind,
      slug: name.slice(0, -3),
      raw: fs.readFileSync(path.join(root, dir, name), "utf8").replace(/\r\n/g, "\n"),
    }));

const contents = [
  ...readCollection("song", "songs"),
  ...readCollection("movie", "movies"),
];
// DB에 올릴 data 파일은 명시한 것만.
//
// 예전에는 data/*.json을 전부 올렸다. 그래서 .gitignore에 있는 생성 산출물
// search-index.json(2.9MB)과 playlist.json(0.35MB)까지 DB에 들어가 lyra_data
// 4.3MB 중 3.2MB를 차지했다. 빌드 때 다시 만들면 되는 것들이라 저장할 이유가 없다.
//
// 목록의 근거: 런타임이 readRuntimeData로 읽거나 관리자가 writeData로 쓰는 이름.
// 새 파일을 추가할 때 여기에 같이 적는다 — 조용히 늘지 않게 하려는 것이 목적이다.
const DATA_ALLOWLIST = new Set([
  // 런타임이 읽는다
  "artwork-backfill-audit.json",
  "lyrics-corrections.json",
  "motifs.json",
  "music-report.json",
  "song-recs.json",
  "taste-recs.json",
  "taste-report.json",
  "watcha-movies.json",
  "watcha-ratings.json",
  // 관리자 화면이 상태로 쓴다
  "instagram-pending.json",
  "instagram-pending-triage.json",
  "instagram-playlists.json",
  "instagram-source-manifest.json",
  "moments.json",
]);

const dataDir = path.join(root, "data");
const allJson = fs.readdirSync(dataDir).filter((name) => name.endsWith(".json")).sort();
const skippedData = allJson.filter((name) => !DATA_ALLOWLIST.has(name));
const data = allJson
  .filter((name) => DATA_ALLOWLIST.has(name))
  .map((name) => ({ name, raw: fs.readFileSync(path.join(dataDir, name), "utf8").replace(/\r\n/g, "\n") }));
if (skippedData.length)
  console.log(`업로드 제외(생성 산출물·비런타임) ${skippedData.length}개: ${skippedData.join(", ")}`);

if (apply) {
  await sql`
    create table if not exists lyra_contents (
      kind text not null check (kind in ('song', 'movie')),
      slug text not null,
      raw text not null,
      revision bigint not null default 1,
      updated_at timestamptz not null default now(),
      primary key (kind, slug)
    )
  `;
  await sql`
    create table if not exists lyra_data (
      name text primary key,
      raw text not null,
      revision bigint not null default 1,
      updated_at timestamptz not null default now()
    )
  `;
}

if (apply) {
  const chunks = (rows, size = 20) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
  // 내용이 같으면 건드리지 않는다 — `where ... is distinct from`이 그 역할을 한다.
  //
  // 예전에는 같은 파일을 다시 올려도 모든 행의 updated_at이 바뀌었다. 그러면
  // lyra_contents의 max(updated_at)으로 만드는 콘텐츠 revision이 통째로 흔들리고,
  // revision을 키로 쓰는 캐시가 전부 무효가 된다. 아무것도 안 바뀌었는데 전곡을
  // 다시 읽는 셈이다. returning으로 실제 바뀐 행만 세어 보고한다.
  let changedContent = 0;
  for (const batch of chunks(contents)) {
    const results = await Promise.all(batch.map((row) => sql`
      insert into lyra_contents (kind, slug, raw)
      values (${row.kind}, ${row.slug}, ${row.raw})
      on conflict (kind, slug) do update
        set raw = excluded.raw, updated_at = now()
        where lyra_contents.raw is distinct from excluded.raw
      returning slug
    `));
    changedContent += results.reduce((n, rows) => n + rows.length, 0);
  }
  let changedData = 0;
  for (const batch of chunks(data)) {
    const results = await Promise.all(batch.map((row) => sql`
      insert into lyra_data (name, raw)
      values (${row.name}, ${row.raw})
      on conflict (name) do update
        set raw = excluded.raw, updated_at = now()
        where lyra_data.raw is distinct from excluded.raw
      returning name
    `));
    changedData += results.reduce((n, rows) => n + rows.length, 0);
  }
  console.log(`변경된 행: 콘텐츠 ${changedContent}, 데이터 ${changedData} (같은 내용은 건드리지 않음)`);
  console.log(`업로드 완료: 곡 ${contents.filter((x) => x.kind === "song").length}, 영화 ${contents.filter((x) => x.kind === "movie").length}, 데이터 ${data.length}`);

  // DB만 바꾸면 사이트는 옛 값을 계속 보여준다 — 캐시 무효화는 관리자 저장 경로에만
  // 있고, 배포로도 지워지지 않는다(Next 데이터 캐시는 태그로만 지워진다). 사람이
  // 기억해야 하는 단계로 두지 않고 여기서 부른다. 실패해도 업로드는 이미 끝났으므로
  // 막지 않고 할 일만 알려 준다.
  // 캐시 무효화는 전용 secret으로 한다 — 예전에는 ADMIN_PASSWORD로 로그인해서
  // 관리자 API를 불렀다. 캐시를 비우자고 스크립트에 전체 권한을 쥐여 주는 구조였고,
  // 로그인 흐름이 바뀔 때마다 조용히 깨졌다. REVALIDATE_SECRET으로 할 수 있는 일은
  // 캐시 무효화뿐이다.
  //
  // 바뀐 행이 없으면 무효화도 필요 없다.
  const site = process.env.LYRA_SITE_URL || "https://lyra-one-zeta.vercel.app";
  const secret = process.env.REVALIDATE_SECRET;
  if (changedContent + changedData === 0) {
    console.log("변경이 없어 캐시 무효화를 건너뜁니다.");
  } else if (!secret) {
    // 업로드는 끝났고 캐시만 남았다. 둘을 뭉뚱그리지 않는다.
    console.log("업로드는 성공했으나 캐시를 비우지 못했습니다: REVALIDATE_SECRET이 없습니다.");
    console.log(`  해결: Vercel과 .env.local에 같은 REVALIDATE_SECRET을 설정하세요. 그 전까지는 최대 6시간 뒤 TTL로 갱신됩니다.`);
    process.exitCode = 1;
  } else {
    try {
      const res = await fetch(`${site}/api/revalidate`, {
        method: "POST",
        headers: { "x-revalidate-secret": secret },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log("사이트 캐시를 비웠습니다.");
    } catch (e) {
      console.log(`업로드는 성공했으나 캐시를 비우지 못했습니다: ${e.message}`);
      console.log("  해결: REVALIDATE_SECRET이 Vercel 쪽과 같은 값인지 확인하세요. 그 전까지는 최대 6시간 뒤 TTL로 갱신됩니다.");
      process.exitCode = 1;
    }
  }
}

const dbContents = await sql`select kind, slug, raw from lyra_contents order by kind, slug`;
const dbData = await sql`select name, raw from lyra_data order by name`;
const digest = (raw) => crypto.createHash("sha256").update(raw).digest("hex");
const expectedContent = new Map(contents.map((x) => [`${x.kind}:${x.slug}`, digest(x.raw)]));
const expectedData = new Map(data.map((x) => [x.name, digest(x.raw)]));
const mismatches = [];
const changes = [];
for (const row of dbContents) {
  const key = `${row.kind}:${row.slug}`;
  if (!expectedContent.has(key)) changes.push(`DB에만 있음 ${key}`);
  else if (expectedContent.get(key) !== digest(row.raw)) changes.push(`수정 ${key}`);
  expectedContent.delete(key);
}
// allowlist 밖의 행은 "틀린 것"이 아니라 "정리 대상"이다. 예전 migration이
// 생성 산출물까지 올려 둔 흔적이므로 검증 실패와 구분해서 알린다.
const prunable = [];
for (const row of dbData) {
  if (!DATA_ALLOWLIST.has(row.name)) {
    prunable.push(row.name);
    continue;
  }
  if (!expectedData.has(row.name)) changes.push(`DB에만 있음 data:${row.name}`);
  else if (expectedData.get(row.name) !== digest(row.raw)) changes.push(`수정 data:${row.name}`);
  expectedData.delete(row.name);
}
if (prunable.length)
  console.log(
    `DB에만 남은 비allowlist 행 ${prunable.length}개: ${prunable.join(", ")}\n` +
      `  정리하려면: node scripts/prune-data-rows.mjs (기본 dry-run)`
  );
mismatches.push(...changes, ...[...expectedContent.keys()].map((x) => `추가 ${x}`), ...[...expectedData.keys()].map((x) => `추가 data:${x}`));
if (mismatches.length) {
  if (!apply && !verifyOnly) {
    console.log(`(dry-run) 변경 예정 ${mismatches.length}건:`);
    for (const item of mismatches.slice(0, 20)) console.log(`  ${item}`);
    if (mismatches.length > 20) console.log(`  … 그리고 ${mismatches.length - 20}건 더`);
    console.log("실제로 반영하려면 --apply를 붙이세요.");
  } else {
    console.error(`검증 실패 ${mismatches.length}건: ${mismatches.slice(0, 10).join(", ")}`);
    process.exitCode = 1;
  }
} else {
  console.log(`${apply || verifyOnly ? "검증 완료" : "(dry-run) 변경 없음"}: ${contents.length + data.length}개 파일의 SHA-256이 모두 일치합니다.`);
}
