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

  // DB만 바꾸면 사이트는 옛 값을 계속 보여준다 — 캐시 무효화는 관리자 저장 경로에만
  // 있고, 배포로도 지워지지 않는다(Next 데이터 캐시는 태그로만 지워진다). 사람이
  // 기억해야 하는 단계로 두지 않고 여기서 부른다. 실패해도 업로드는 이미 끝났으므로
  // 막지 않고 할 일만 알려 준다.
  const site = process.env.LYRA_SITE_URL || "https://lyra-one-zeta.vercel.app";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.log(`캐시를 비우지 못했습니다(ADMIN_PASSWORD 없음). 관리자 화면에서 새로고침하거나 ${site} 배포 후 확인하세요.`);
  } else {
    try {
      const login = await fetch(`${site}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const cookie = login.headers.get("set-cookie");
      if (!login.ok || !cookie) throw new Error(`로그인 실패 ${login.status}`);
      const res = await fetch(`${site}/api/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie.split(";")[0], Origin: site },
        body: JSON.stringify({ action: "revalidate" }),
      });
      if (!res.ok) throw new Error(`무효화 실패 ${res.status}`);
      console.log("사이트 캐시를 비웠습니다.");
    } catch (e) {
      console.log(`캐시를 비우지 못했습니다(${e.message}). 관리자 화면을 한 번 열면 저장 시 자동으로 비워집니다.`);
    }
  }
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
