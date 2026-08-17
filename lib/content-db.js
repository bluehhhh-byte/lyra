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

async function listMomentRows() {
  const sql = getContentDb();
  return sql`
    select m.slug, m.title, m.body, m.start_date, m.end_date,
           m.emotions, m.keywords, m.published, m.created_at, m.updated_at,
           coalesce(
             json_agg(json_build_object(
               'target_kind', l.target_kind,
               'target_slug', l.target_slug,
               'excerpt', l.excerpt,
               'note', l.note,
               'position', l.position
             ) order by l.position) filter (where l.target_slug is not null),
             '[]'::json
           ) as links
    from lyra_moments m
    left join lyra_moment_links l on l.moment_slug = m.slug
    group by m.slug
    order by m.start_date desc, m.slug
  `;
}

const cachedMoments = unstable_cache(listMomentRows, ["lyra-db-moments"], {
  tags: ["lyra-moments"],
});

export function listCachedMomentRows() {
  return cachedMoments();
}

export async function writeMomentRow(moment, previousSlug = "") {
  const sql = getContentDb();
  if (previousSlug && previousSlug !== moment.slug)
    throw new Error("기존 장면의 주소는 변경할 수 없습니다");
  await sql`
    insert into lyra_moments (slug, title, body, start_date, end_date, emotions, keywords, published)
    values (
      ${moment.slug}, ${moment.title}, ${moment.body}, ${moment.startDate},
      ${moment.endDate || null}, ${moment.emotions}, ${moment.keywords}, ${moment.published}
    )
    on conflict (slug) do update set
      title = excluded.title,
      body = excluded.body,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      emotions = excluded.emotions,
      keywords = excluded.keywords,
      published = excluded.published,
      updated_at = now()
  `;
  await sql`delete from lyra_moment_links where moment_slug = ${moment.slug}`;
  await Promise.all(moment.links.map((link) => sql`
    insert into lyra_moment_links
      (moment_slug, target_kind, target_slug, excerpt, note, position)
    values
      (${moment.slug}, ${link.targetKind}, ${link.targetSlug}, ${link.excerpt}, ${link.note}, ${link.position})
  `));
}

export async function deleteMomentRow(slug) {
  const sql = getContentDb();
  await sql`delete from lyra_moments where slug = ${slug}`;
}

export async function contentRevision() {
  if (!databaseContentEnabled()) return "files";
  const sql = getContentDb();
  const rows = await sql`
    select greatest(
      coalesce((select max(updated_at) from lyra_contents), to_timestamp(0)),
      coalesce((select max(updated_at) from lyra_data), to_timestamp(0)),
      coalesce((select max(updated_at) from lyra_moments), to_timestamp(0))
    )::text as revision
  `;
  return rows[0]?.revision || "empty";
}
