// Neon → md/json 되돌리기. migrate-content.mjs의 반대 방향이다.
//
// LYRA_CONTENT_STORE=neon으로 바꾼 뒤로 곡·영화·데이터는 DB에만 쌓인다. 저장소에는
// 스위치를 켠 날의 상태가 그대로 멈춰 있고, 관리자에서 무엇을 고쳐도 커밋이 생기지
// 않는다(그게 원래 목적이었다 — 저장 한 번에 커밋 하나가 계정을 정지시켰다).
//
// 그래서 백업이 사라졌다. 이 스크립트가 그 자리를 메운다. DB를 파일로 되돌려 놓으면
// git이 다시 이력을 맡는다. 커밋은 하지 않는다 — 무엇이 바뀌었는지 사람이 보고
// 정하는 편이 낫다.
//
//   node scripts/dump-content.mjs           파일로 쓴다
//   node scripts/dump-content.mjs --check   무엇이 다른지만 보고 쓰지 않는다
//   node scripts/dump-content.mjs --verify  SHA-256만 대조하고 쓰지 않는다
//
// 다루지 않는 것: lyra_moments(문화적 장면)는 md 대응물이 없어 DB에만 있다.
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { CONTENT_DATA_FILES } from "../lib/content-data-files.js";
import { contentDigest, normalizeStoredContent } from "../lib/content-digest.js";

dotenv.config({ path: ".env.local", override: false, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL이 없습니다. .env.local을 확인하세요.");
const sql = neon(url);
const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const verifyOnly = process.argv.includes("--verify");

// 저장소 파일은 CRLF로 체크아웃될 수 있다. 줄바꿈 차이만으로 "달라졌다"고 하면
// 윈도우에서는 매번 전량이 바뀐 것처럼 보인다.
const norm = normalizeStoredContent;

const DIRS = { song: "songs", movie: "movies" };

// 증분 덤프(2026-09-28). 매일 전량(본문 + 데이터 행 수 MB)을 읽으면 그것만으로
// Neon 월 전송량(무료 5GB)의 몇 %를 쓴다. 먼저 행마다 md5만 받고(수십 KB), 지난
// 덤프 때 적어 둔 .backup-manifest.json과 다른 행만 본문을 받는다.
// --check·--verify·--full은 예전처럼 전량을 읽는다(사람이 손으로 돌리는 확인용).
const MANIFEST = path.join(root, ".backup-manifest.json");
const incremental = !checkOnly && !verifyOnly && !process.argv.includes("--full");
let manifest = {};
if (incremental) {
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {
    manifest = {}; // 첫 덤프 — 전량을 읽는다
  }
}
const heads = await sql`select kind, slug, md5(raw) as h from lyra_contents order by kind, slug`;
const dataHeads = await sql`select name, md5(raw) as h from lyra_data order by name`;
const unchanged = (key, h, file) => incremental && manifest[key] === h && fs.existsSync(file);
const needContent = heads
  .filter((r) => DIRS[r.kind] && !unchanged(`${r.kind}/${r.slug}`, r.h, path.join(root, DIRS[r.kind], `${r.slug}.md`)))
  .map((r) => `${r.kind}/${r.slug}`);
const needData = dataHeads
  .filter((r) => !unchanged(`data/${r.name}`, r.h, path.join(root, "data", r.name)))
  .map((r) => r.name);
const fetchedRows = needContent.length
  ? await sql`select kind, slug, raw from lyra_contents where kind || '/' || slug = any(${needContent})`
  : [];
const fetchedData = needData.length ? await sql`select name, raw from lyra_data where name = any(${needData})` : [];
const rawByKey = new Map(fetchedRows.map((r) => [`${r.kind}/${r.slug}`, r.raw]));
const dataByName = new Map(fetchedData.map((r) => [r.name, r.raw]));
// 바뀌지 않은 행은 raw가 null이다 — 파일이 이미 그 내용이므로 쓰지도 대조하지도 않는다
const rows = heads.map((r) => ({ kind: r.kind, slug: r.slug, raw: rawByKey.has(`${r.kind}/${r.slug}`) ? rawByKey.get(`${r.kind}/${r.slug}`) : null }));
const dataRows = dataHeads.map((r) => ({ name: r.name, raw: dataByName.has(r.name) ? dataByName.get(r.name) : null }));
const fetchedCount = fetchedRows.length + fetchedData.length;

// DB가 비어 있는데 덮어쓰면 저장소가 통째로 지워진다. 연결이 잘못됐거나 마이그레이션이
// 실패한 상태일 수 있으므로, 그럴 때는 아무것도 하지 않고 멈춘다.
if (!rows.length) throw new Error("DB에 콘텐츠가 없습니다. 연결 대상을 확인하세요 — 덮어쓰지 않고 멈춥니다.");

const planned = [];
const seen = { song: new Set(), movie: new Set() };

for (const row of rows) {
  const dir = DIRS[row.kind];
  if (!dir) continue;
  seen[row.kind].add(row.slug);
  if (row.raw === null) continue; // 지난 덤프 이후 바뀌지 않음
  const file = path.join(root, dir, `${row.slug}.md`);
  const before = fs.existsSync(file) ? norm(fs.readFileSync(file, "utf8")) : null;
  const after = norm(row.raw);
  if (before === after) continue;
  planned.push({ kind: before === null ? "추가" : "수정", difference: before === null ? "DB에만 있음" : "내용 다름", file: `${dir}/${row.slug}.md`, write: () => fs.writeFileSync(file, after) });
}

for (const row of dataRows) {
  if (row.raw === null) continue;
  const file = path.join(root, "data", row.name);
  const before = fs.existsSync(file) ? norm(fs.readFileSync(file, "utf8")) : null;
  const after = norm(row.raw);
  if (before === after) continue;
  planned.push({ kind: before === null ? "추가" : "수정", difference: before === null ? "DB에만 있음" : "내용 다름", file: `data/${row.name}`, write: () => fs.writeFileSync(file, after) });
}

// DB에서 지워진 글은 파일에서도 지운다. 안 그러면 삭제가 영원히 저장소에 남는다.
for (const [kind, dir] of Object.entries(DIRS)) {
  const dirPath = path.join(root, dir);
  if (!fs.existsSync(dirPath)) continue;
  for (const name of fs.readdirSync(dirPath)) {
    if (!name.endsWith(".md")) continue;
    const slug = name.slice(0, -3);
    if (seen[kind].has(slug)) continue;
    planned.push({ kind: "삭제", difference: "파일에만 있음", file: `${dir}/${name}`, write: () => fs.unlinkSync(path.join(dirPath, name)) });
  }
}

const seenData = new Set(dataRows.map((row) => row.name));
for (const name of CONTENT_DATA_FILES) {
  const file = path.join(root, "data", name);
  if (fs.existsSync(file) && !seenData.has(name))
    // 어느 쪽이 옳은지 판단 전에는 data 파일을 지우지 않는다. --check 보고 전용이다.
    planned.push({ kind: "검토", difference: "파일에만 있음", file: `data/${name}`, write: null });
}

const byKind = planned.reduce((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] || 0) + 1 }), {});
const summary = Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(" · ") || "변경 없음";

const hashMismatches = [];
for (const row of rows) {
  const dir = DIRS[row.kind];
  if (!dir) continue;
  const file = path.join(root, dir, `${row.slug}.md`);
  if (row.raw === null) continue;
  if (!fs.existsSync(file)) hashMismatches.push(`파일 없음 ${dir}/${row.slug}.md`);
  else if (contentDigest(fs.readFileSync(file, "utf8")) !== contentDigest(row.raw))
    hashMismatches.push(`해시 불일치 ${dir}/${row.slug}.md`);
}
for (const row of dataRows) {
  if (row.raw === null) continue;
  const file = path.join(root, "data", row.name);
  if (!fs.existsSync(file)) hashMismatches.push(`파일 없음 data/${row.name}`);
  else if (contentDigest(fs.readFileSync(file, "utf8")) !== contentDigest(row.raw))
    hashMismatches.push(`해시 불일치 data/${row.name}`);
}

if (verifyOnly) {
  console.log(`DB ${rows.length + dataRows.length}행 SHA-256 대조 · 일치 ${rows.length + dataRows.length - hashMismatches.length} · 불일치 ${hashMismatches.length}`);
  for (const item of hashMismatches) console.log(`  ${item}`);
  process.exitCode = hashMismatches.length ? 1 : 0;
} else if (checkOnly) {
  console.log(`DB 곡 ${seen.song.size} · 영화 ${seen.movie.size} · 데이터 ${dataRows.length}`);
  console.log(summary);
  for (const p of planned) console.log(`  ${p.difference} ${p.file}`);
  process.exitCode = planned.length ? 1 : 0;
} else {
  for (const p of planned) p.write?.();
  console.log(`DB 곡 ${seen.song.size} · 영화 ${seen.movie.size} · 데이터 ${dataRows.length}`);
  console.log(`파일에 반영: ${summary}`);

  // 쓴 결과가 DB와 같은지 다시 읽어 확인한다 — 인코딩·줄바꿈으로 어긋나면 다음 백업이
  // 조용히 틀린 것을 저장한다.
  const bad = [];
  for (const row of rows) {
    const dir = DIRS[row.kind];
    if (!dir) continue;
    const file = path.join(root, dir, `${row.slug}.md`);
    if (row.raw === null) {
      if (!fs.existsSync(file)) bad.push(`${row.kind}:${row.slug}`);
      continue;
    }
    if (!fs.existsSync(file) || contentDigest(fs.readFileSync(file, "utf8")) !== contentDigest(row.raw))
      bad.push(`${row.kind}:${row.slug}`);
  }
  for (const row of dataRows) {
    const file = path.join(root, "data", row.name);
    if (row.raw === null) {
      if (!fs.existsSync(file)) bad.push(`data:${row.name}`);
      continue;
    }
    if (!fs.existsSync(file) || contentDigest(fs.readFileSync(file, "utf8")) !== contentDigest(row.raw))
      bad.push(`data:${row.name}`);
  }
  if (bad.length) {
    console.error(`검증 실패 ${bad.length}건: ${bad.slice(0, 10).join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`검증 완료: 새로 받은 ${fetchedCount}개의 SHA-256이 일치하고, 나머지 ${rows.length + dataRows.length - fetchedCount}개는 지난 덤프 그대로입니다.`);
    // 다음 덤프가 바뀐 행만 받도록 이번 상태를 적어 둔다 — 검증을 통과했을 때만
    if (incremental) {
      const next = {};
      for (const r of heads) if (DIRS[r.kind]) next[`${r.kind}/${r.slug}`] = r.h;
      for (const r of dataHeads) next[`data/${r.name}`] = r.h;
      fs.writeFileSync(MANIFEST, `${JSON.stringify(next, null, 1)}\n`);
    }
  }
}
