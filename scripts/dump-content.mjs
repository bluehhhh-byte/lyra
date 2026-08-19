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
//
// 다루지 않는 것: lyra_moments(문화적 장면)는 md 대응물이 없어 DB에만 있다.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local", override: false, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL이 없습니다. .env.local을 확인하세요.");
const sql = neon(url);
const root = process.cwd();
const checkOnly = process.argv.includes("--check");

const digest = (raw) => crypto.createHash("sha256").update(raw).digest("hex");
// 저장소 파일은 CRLF로 체크아웃될 수 있다. 줄바꿈 차이만으로 "달라졌다"고 하면
// 윈도우에서는 매번 전량이 바뀐 것처럼 보인다.
const norm = (raw) => raw.replace(/\r\n/g, "\n");

const DIRS = { song: "songs", movie: "movies" };

const rows = await sql`select kind, slug, raw from lyra_contents order by kind, slug`;
const dataRows = await sql`select name, raw from lyra_data order by name`;

// DB가 비어 있는데 덮어쓰면 저장소가 통째로 지워진다. 연결이 잘못됐거나 마이그레이션이
// 실패한 상태일 수 있으므로, 그럴 때는 아무것도 하지 않고 멈춘다.
if (!rows.length) throw new Error("DB에 콘텐츠가 없습니다. 연결 대상을 확인하세요 — 덮어쓰지 않고 멈춥니다.");

const planned = [];
const seen = { song: new Set(), movie: new Set() };

for (const row of rows) {
  const dir = DIRS[row.kind];
  if (!dir) continue;
  seen[row.kind].add(row.slug);
  const file = path.join(root, dir, `${row.slug}.md`);
  const before = fs.existsSync(file) ? norm(fs.readFileSync(file, "utf8")) : null;
  const after = norm(row.raw);
  if (before === after) continue;
  planned.push({ kind: before === null ? "추가" : "수정", file: `${dir}/${row.slug}.md`, write: () => fs.writeFileSync(file, after) });
}

for (const row of dataRows) {
  const file = path.join(root, "data", row.name);
  const before = fs.existsSync(file) ? norm(fs.readFileSync(file, "utf8")) : null;
  const after = norm(row.raw);
  if (before === after) continue;
  planned.push({ kind: before === null ? "추가" : "수정", file: `data/${row.name}`, write: () => fs.writeFileSync(file, after) });
}

// DB에서 지워진 글은 파일에서도 지운다. 안 그러면 삭제가 영원히 저장소에 남는다.
for (const [kind, dir] of Object.entries(DIRS)) {
  const dirPath = path.join(root, dir);
  if (!fs.existsSync(dirPath)) continue;
  for (const name of fs.readdirSync(dirPath)) {
    if (!name.endsWith(".md")) continue;
    const slug = name.slice(0, -3);
    if (seen[kind].has(slug)) continue;
    planned.push({ kind: "삭제", file: `${dir}/${name}`, write: () => fs.unlinkSync(path.join(dirPath, name)) });
  }
}

const byKind = planned.reduce((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] || 0) + 1 }), {});
const summary = Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(" · ") || "변경 없음";

if (checkOnly) {
  console.log(`DB 곡 ${seen.song.size} · 영화 ${seen.movie.size} · 데이터 ${dataRows.length}`);
  console.log(summary);
  for (const p of planned.slice(0, 20)) console.log(`  ${p.kind} ${p.file}`);
  if (planned.length > 20) console.log(`  … 그리고 ${planned.length - 20}건 더`);
  process.exitCode = planned.length ? 1 : 0;
} else {
  for (const p of planned) p.write();
  console.log(`DB 곡 ${seen.song.size} · 영화 ${seen.movie.size} · 데이터 ${dataRows.length}`);
  console.log(`파일에 반영: ${summary}`);

  // 쓴 결과가 DB와 같은지 다시 읽어 확인한다 — 인코딩·줄바꿈으로 어긋나면 다음 백업이
  // 조용히 틀린 것을 저장한다.
  const bad = [];
  for (const row of rows) {
    const dir = DIRS[row.kind];
    if (!dir) continue;
    const file = path.join(root, dir, `${row.slug}.md`);
    if (!fs.existsSync(file) || digest(norm(fs.readFileSync(file, "utf8"))) !== digest(norm(row.raw)))
      bad.push(`${row.kind}:${row.slug}`);
  }
  for (const row of dataRows) {
    const file = path.join(root, "data", row.name);
    if (!fs.existsSync(file) || digest(norm(fs.readFileSync(file, "utf8"))) !== digest(norm(row.raw)))
      bad.push(`data:${row.name}`);
  }
  if (bad.length) {
    console.error(`검증 실패 ${bad.length}건: ${bad.slice(0, 10).join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`검증 완료: ${rows.length + dataRows.length}개의 SHA-256이 모두 일치합니다.`);
  }
}
