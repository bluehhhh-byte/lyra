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
const dataDir = path.join(root, "data");
const data = fs.readdirSync(dataDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => ({ name, raw: fs.readFileSync(path.join(dataDir, name), "utf8").replace(/\r\n/g, "\n") }));

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

if (!verifyOnly) {
  const chunks = (rows, size = 20) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
  for (const batch of chunks(contents)) {
    await Promise.all(batch.map((row) => sql`
      insert into lyra_contents (kind, slug, raw)
      values (${row.kind}, ${row.slug}, ${row.raw})
      on conflict (kind, slug) do update set raw = excluded.raw, updated_at = now()
    `));
  }
  for (const batch of chunks(data)) {
    await Promise.all(batch.map((row) => sql`
      insert into lyra_data (name, raw)
      values (${row.name}, ${row.raw})
      on conflict (name) do update set raw = excluded.raw, updated_at = now()
    `));
  }
  console.log(`업로드 완료: 곡 ${contents.filter((x) => x.kind === "song").length}, 영화 ${contents.filter((x) => x.kind === "movie").length}, 데이터 ${data.length}`);
}

const dbContents = await sql`select kind, slug, raw from lyra_contents order by kind, slug`;
const dbData = await sql`select name, raw from lyra_data order by name`;
const digest = (raw) => crypto.createHash("sha256").update(raw).digest("hex");
const expectedContent = new Map(contents.map((x) => [`${x.kind}:${x.slug}`, digest(x.raw)]));
const expectedData = new Map(data.map((x) => [x.name, digest(x.raw)]));
const mismatches = [];
for (const row of dbContents) {
  const key = `${row.kind}:${row.slug}`;
  if (expectedContent.get(key) !== digest(row.raw)) mismatches.push(key);
  expectedContent.delete(key);
}
for (const row of dbData) {
  if (expectedData.get(row.name) !== digest(row.raw)) mismatches.push(`data:${row.name}`);
  expectedData.delete(row.name);
}
mismatches.push(...expectedContent.keys(), ...[...expectedData.keys()].map((x) => `data:${x}`));
if (mismatches.length) {
  console.error(`검증 실패 ${mismatches.length}건: ${mismatches.slice(0, 10).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`검증 완료: ${contents.length + data.length}개 파일의 SHA-256이 모두 일치합니다.`);
}
