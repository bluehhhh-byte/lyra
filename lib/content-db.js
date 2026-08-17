import { neon } from "@neondatabase/serverless";
import { unstable_cache } from "next/cache.js";

let client;

// Explicit opt-in prevents an injected DATABASE_URL from switching the live
// site before the file corpus has been migrated and verified.
export function databaseContentEnabled(env = process.env) {
  return env.LYRA_CONTENT_STORE === "neon";
}

export function getContentDb(env = process.env) {
  if (!databaseContentEnabled(env))
    throw new Error("DB 콘텐츠 저장소를 사용하려면 LYRA_CONTENT_STORE=neon이 필요합니다");
  if (!env.DATABASE_URL)
    throw new Error("LYRA_CONTENT_STORE=neon인데 DATABASE_URL이 없습니다");
  if (!client) client = neon(env.DATABASE_URL);
  return client;
}

export async function readContentRow(kind, slug) {
  const sql = getContentDb();
  const rows = await sql`
    select raw, revision
    from lyra_contents
    where kind = ${kind} and slug = ${slug}
    limit 1
  `;
  return rows[0] || null;
}

export async function listContentRows(kind) {
  const sql = getContentDb();
  return sql`
    select slug, raw, revision
    from lyra_contents
    where kind = ${kind}
    order by slug
  `;
}

const cachedSongs = unstable_cache(() => listContentRows("song"), ["lyra-db-songs"], {
  tags: ["lyra-content", "lyra-songs"],
});
const cachedMovies = unstable_cache(() => listContentRows("movie"), ["lyra-db-movies"], {
  tags: ["lyra-content", "lyra-movies"],
});

export function listCachedContentRows(kind) {
  return kind === "song" ? cachedSongs() : cachedMovies();
}

export async function writeContentRow(kind, slug, raw) {
  const sql = getContentDb();
  const rows = await sql`
    insert into lyra_contents (kind, slug, raw)
    values (${kind}, ${slug}, ${raw})
    on conflict (kind, slug) do update
      set raw = excluded.raw,
          revision = lyra_contents.revision + 1,
          updated_at = now()
    returning revision
  `;
  return rows[0]?.revision || 1;
}

export async function deleteContentRow(kind, slug) {
  const sql = getContentDb();
  await sql`delete from lyra_contents where kind = ${kind} and slug = ${slug}`;
}

export async function readDataRow(name) {
  const sql = getContentDb();
  const rows = await sql`
    select raw, revision
    from lyra_data
    where name = ${name}
    limit 1
  `;
  return rows[0] || null;
}

export async function writeDataRow(name, raw) {
  const sql = getContentDb();
  const rows = await sql`
    insert into lyra_data (name, raw)
    values (${name}, ${raw})
    on conflict (name) do update
      set raw = excluded.raw,
          revision = lyra_data.revision + 1,
          updated_at = now()
    returning revision
  `;
  return rows[0]?.revision || 1;
}

const cachedData = unstable_cache(async (name) => readDataRow(name), ["lyra-db-data"], {
  tags: ["lyra-data"],
});

export function readCachedDataRow(name) {
  return cachedData(name);
}

export async function contentRevision() {
  if (!databaseContentEnabled()) return "files";
  const sql = getContentDb();
  const rows = await sql`
    select greatest(
      coalesce((select max(updated_at) from lyra_contents), to_timestamp(0)),
      coalesce((select max(updated_at) from lyra_data), to_timestamp(0))
    )::text as revision
  `;
  return rows[0]?.revision || "empty";
}
