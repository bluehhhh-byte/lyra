import { neon } from "@neondatabase/serverless";
import { unstable_cache } from "next/cache.js";
import { createHash } from "node:crypto";
import zlib from "node:zlib";
import { recordNeonRead } from "./usage-metrics-db.js";
import { usageMetricsEnabled } from "./usage-metrics-core.js";

let client;

// 읽기 계측. 기본은 꺼져 있고, 꺼진 동안에는 DB를 건드리지 않는다.
//
// 켜져 있던 동안 콘텐츠 read 한 번이 곧바로 lyra_usage_buckets upsert를 불러
// 왕복이 두 배가 됐다. 관측이 관측 대상을 깨우는 구조였다.
// 자세한 배경은 lib/usage-metrics-core.js의 usageMetricsEnabled 주석에 있다.
async function trackRead(sql, value) {
  if (!usageMetricsEnabled()) return value;
  try {
    await recordNeonRead(sql, value);
  } catch (error) {
    // 계측 실패가 콘텐츠 읽기까지 실패시켜서는 안 된다.
    console.error(`[usage] Neon 읽기 계측 실패: ${error.message}`);
  }
  return value;
}

// 환경변수 값은 사람이 손으로 붙여넣는다. 붙여넣기에는 눈에 안 보이는 것이 따라온다 —
// BOM(U+FEFF), 줄 끝 공백, 감싼 따옴표. 2026-08-19까지 이틀 동안 Neon 저장소가 꺼져
// 있었는데, 값이 "neon"이 아니라 BOM이 앞에 붙은 값이었기 때문이다(PowerShell Out-File이
// BOM을 붙인다). 화면에는 neon이라고 보이니 아무도 의심하지 않았다.
//
// 스위치를 고치자 이번엔 DATABASE_URL이 "not a valid URL"로 빌드를 깨뜨렸다. 같은
// 붙여넣기에서 온 같은 문제였고, 스위치가 꺼져 있는 동안 아무도 그 값을 쓰지 않아
// 가려져 있었을 뿐이다. 값을 읽는 곳에서 한 번 다듬는다.
const clean = (v) =>
  String(v ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^(["'])([\s\S]*)\1$/, "$2")
    .trim();

// Explicit opt-in prevents an injected DATABASE_URL from switching the live
// site before the file corpus has been migrated and verified.
export function databaseContentEnabled(env = process.env) {
  return clean(env.LYRA_CONTENT_STORE).toLowerCase() === "neon";
}

export function getContentDb(env = process.env) {
  if (!databaseContentEnabled(env))
    throw new Error("DB 콘텐츠 저장소를 사용하려면 LYRA_CONTENT_STORE=neon이 필요합니다");
  const url = clean(env.DATABASE_URL);
  if (!url) throw new Error("LYRA_CONTENT_STORE=neon인데 DATABASE_URL이 없습니다");
  // 무엇이 잘못됐는지 값을 흘리지 않고 말한다. neon()이 내는 "not a valid URL"만으로는
  // 오타인지 보이지 않는 문자인지 알 수 없어 빌드 로그 앞에서 한참을 헤맸다.
  if (!/^postgres(ql)?:\/\//.test(url))
    throw new Error(
      `DATABASE_URL이 postgres:// 로 시작하지 않습니다 (길이 ${url.length}, 시작 ${JSON.stringify(url.slice(0, 8))})`
    );
  if (!client) client = neon(url);
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
  await trackRead(sql, rows);
  return rows[0] || null;
}

// 본문을 뺀 목록 — 프론트매터까지만 잘라서 가져온다.
//
// 목록·홈·연관 추천·태그·인물은 가사를 한 줄도 쓰지 않는데 전곡 본문을 받아
// 파싱하고 있었다. 자르는 일을 DB에서 하면 캐시 항목만 작아지는 게 아니라
// Neon egress도 같이 준다 — 곡 928개 기준 3.12MB → 0.91MB.
//
// 프론트매터의 끝은 두 번째 `---`다. 여는 쪽은 첫 줄이라 앞에 개행이 없고,
// 닫는 쪽에는 있다. 그래서 `\n---`의 첫 등장이 곧 경계다.
export async function listContentMetaRows(kind) {
  const sql = getContentDb();
  const rows = await sql`
    select slug,
           substring(raw from 1 for position(E'\n---' in raw) + 4) as raw,
           revision
    from lyra_contents
    where kind = ${kind}
    order by slug
  `;
  return trackRead(sql, rows);
}

// 관리자 최근 변경 목록. lyra_contents의 기존 updated_at만 읽으며 별도 이력
// 테이블을 만들지 않는다. 한 콘텐츠의 과거 revision 전체가 아니라 "마지막으로
// 무엇이 바뀌었는가"를 보여주는 운영 현황용 목록이다.
export async function listRecentContentChanges(limit = 12) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 12, 50));
  const sql = getContentDb();
  const rows = await sql`
    select kind, slug, revision, updated_at::text as updated_at
    from lyra_contents
    order by updated_at desc, kind, slug
    limit ${safeLimit}
  `;
  await trackRead(sql, rows);
  return rows.map((row) => ({
    kind: row.kind,
    slug: row.slug,
    revision: Number(row.revision) || 0,
    updatedAt: row.updated_at,
  }));
}

// 전곡 본문을 한 항목에 담지 않기 위한 샤드 수. 곡 928개에 4샤드면 항목당
// 압축 후 약 0.4MB — 2MiB 한도까지 곡이 네 배 늘어도 견딘다.
// hashtext는 slug 기준이라 곡이 늘어도 분포가 고르게 유지된다(현재 248/223/237/220).
export const CONTENT_SHARDS = 4;

export async function listContentShard(kind, shard) {
  const sql = getContentDb();
  const rows = await sql`
    select slug, raw, revision
    from lyra_contents
    where kind = ${kind} and mod(abs(hashtext(slug)), ${CONTENT_SHARDS}) = ${shard}
    order by slug
  `;
  return trackRead(sql, rows);
}

// unstable_cache는 2MB가 넘는 값을 저장하지 않는다. 던지지 않고 경고만 낸 뒤 그냥
// 넣지 않으므로, 겉보기에는 캐시가 도는 것 같지만 실제로는 한 번도 들어가지 않는다.
// 곡 전량이 2.28MB라 정확히 그 상태였고, 모든 요청이 Neon을 2.4초씩 다시 읽었다.
// 압축하면 들어간다 — 넣을 때 126ms, 꺼낼 때 15ms다.
const CACHE_LIMIT = 2 * 1024 * 1024;

export const packRows = (rows) => {
  const packed = zlib.gzipSync(Buffer.from(JSON.stringify(rows))).toString("base64");
  // 곡이 늘면 압축본도 언젠가 한도를 넘는다. 그날 다시 조용히 느려지지 않도록 미리 말한다.
  if (packed.length > CACHE_LIMIT * 0.9)
    console.warn(
      `[content-db] 캐시 payload ${(packed.length / 1048576).toFixed(2)}MB — 2MB 한도에 근접. ` +
        `넘으면 캐시가 통째로 무효가 되어 요청마다 DB를 다시 읽는다.`
    );
  return packed;
};

export const unpackRows = (packed) => JSON.parse(zlib.gunzipSync(Buffer.from(packed, "base64")).toString());

// 태그 무효화가 정상 경로지만, 그것만 믿으면 무효화를 놓친 경로에서 옛 값이
// 무기한 살아남는다 — 실제로 스크립트로 DB를 고쳤을 때 배포를 해도 옛 번역이
// 계속 서빙됐다. 시한은 그 최악의 경우를 위한 그물이다.
//
// 5분으로 뒀다가 2026-08-22 Neon 무료 전송 한도(월 5GB)를 태워 먹었다. 캐시는
// Vercel Data Cache라 인스턴스별이 아니라 전역이므로, 5분 시한은 곡+영화 전량
// 2.3MB를 하루 288번 다시 읽는다는 뜻이다 — 월 20GB. 한도의 네 배다.
// 6시간이면 월 0.6GB로 떨어지고, 그물로서의 역할(언젠가는 스스로 갱신)은 그대로다.
// 즉시 반영이 필요한 저장 경로는 원래 태그 무효화를 부르므로 영향을 받지 않는다.
const CACHE_TTL_SECONDS = 6 * 60 * 60;

// DB가 죽었을 때 파일 백업으로 내려앉았는지 — /api/version이 이걸 보고한다.
// 조용히 옛 데이터를 서빙하면 "왜 새 곡이 안 보이지"로 며칠을 헤매게 된다.
let fellBackAt = 0;
export const noteContentFallback = () => {
  fellBackAt = Date.now();
};
export const contentFallbackActive = () => Date.now() - fellBackAt < 10 * 60_000;

// 캐시 태그 — 저장·삭제가 무효화해야 하는 이름을 한 곳에서 만든다.
// 여기저기서 문자열을 직접 쓰면 새 캐시를 추가할 때 무효화만 빠뜨린다.
export const contentTags = (kind) => ["lyra-content", `lyra-${kind}s`];
// Next serializes cache tags into the x-next-cache-tags response header. A slug may
// contain Korean/Japanese text, which is not a valid Node.js header value and used
// to turn an otherwise successful song write into a 500 during revalidation.
// Hashing also keeps the tag safely below Next's length limit for long titles.
export const rowTag = (kind, slug) => {
  const digest = createHash("sha256").update(String(slug), "utf8").digest("hex");
  return `lyra-${kind}-row-${digest}`;
};

// 전곡 본문은 샤드로 나눠 담는다.
//
// 2026-08 기준 한 항목에 1.61MB로 2MiB 한도의 78%였다. unstable_cache는 한도를
// 넘으면 던지지 않고 조용히 저장을 건너뛴다 — 캐시가 도는 것처럼 보이지만 매 요청
// DB를 다시 읽는다. 곡 약 1,200개에서 그 절벽에 닿을 예정이었다.
// 샤드로 나누면 곡이 네 배 늘어도 항목 하나가 한도에 닿지 않는다.
const cachedShards = new Map();
function shardEntry(kind, shard) {
  const key = `${kind}:${shard}`;
  if (!cachedShards.has(key))
    cachedShards.set(
      key,
      unstable_cache(async () => packRows(await listContentShard(kind, shard)), [`lyra-db-${kind}-shard${shard}-gz`], {
        tags: contentTags(kind),
        revalidate: CACHE_TTL_SECONDS,
      })
    );
  return cachedShards.get(key);
}

// 본문이 필요한 소비자만 쓴다 — 검색 인덱스, 통계, 관리자, 빌드 시점 집계.
// 목록·홈·연관 추천은 아래 listCachedContentMeta를 쓴다.
export async function listCachedContentRows(kind) {
  const shards = await Promise.all(
    Array.from({ length: CONTENT_SHARDS }, (_, i) => shardEntry(kind, i)())
  );
  // 샤드는 해시 순서라 합치면 순서가 섞인다. 기존 호출자가 기대하는 slug 정렬을 되돌린다.
  return shards.flatMap(unpackRows).sort((a, b) => a.slug.localeCompare(b.slug));
}

// 본문 없는 목록. 가사를 쓰지 않는 화면 전부가 이걸 쓴다.
const cachedMeta = new Map();
function metaEntry(kind) {
  if (!cachedMeta.has(kind))
    cachedMeta.set(
      kind,
      unstable_cache(async () => packRows(await listContentMetaRows(kind)), [`lyra-db-${kind}-meta-gz`], {
        tags: contentTags(kind),
        revalidate: CACHE_TTL_SECONDS,
      })
    );
  return cachedMeta.get(kind);
}

export async function listCachedContentMeta(kind) {
  return unpackRows(await metaEntry(kind)());
}

// 상세 한 건. 전곡을 불러 find하던 것을 slug 단건 조회로 바꾼다.
//
// 캐시 키에 slug가 들어가므로 항목이 곡 수만큼 생기지만, 각각 3KB 남짓이라
// 2MiB 한도와는 무관하다. 저장·삭제는 rowTag로 그 한 건만 무효화한다.
export async function readCachedContentRow(kind, slug) {
  const entry = unstable_cache(
    async () => {
      const row = await readContentRow(kind, slug);
      return row ? packRows(row) : null;
    },
    [`lyra-db-${kind}-row-gz`, slug],
    { tags: [...contentTags(kind), rowTag(kind, slug)], revalidate: CACHE_TTL_SECONDS }
  );
  const packed = await entry();
  return packed ? unpackRows(packed) : null;
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
  await trackRead(sql, rows);
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
  revalidate: CACHE_TTL_SECONDS,
});

export function readCachedDataRow(name) {
  return cachedData(name);
}

async function listMomentRows() {
  const sql = getContentDb();
  const rows = await sql`
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
  return trackRead(sql, rows);
}

const cachedMoments = unstable_cache(listMomentRows, ["lyra-db-moments"], {
  tags: ["lyra-moments"],
  revalidate: CACHE_TTL_SECONDS,
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

const cachedContentRevision = unstable_cache(async () => {
  const sql = getContentDb();
  const rows = await sql`
    select greatest(
      coalesce((select max(updated_at) from lyra_contents), to_timestamp(0)),
      coalesce((select max(updated_at) from lyra_data), to_timestamp(0)),
      coalesce((select max(updated_at) from lyra_moments), to_timestamp(0))
    )::text as revision
  `;
  await trackRead(sql, rows);
  return rows[0]?.revision || "empty";
}, ["lyra-content-revision"], {
  // 검색 API는 서버리스 인스턴스마다 뜰 수 있다. 인스턴스 메모리의 60초 캐시만으로는
  // 콜드 스타트마다 이 쿼리가 Neon을 깨우므로, 콘텐츠와 같은 전역 Data Cache에 둔다.
  // 저장 경로가 이미 아래 태그를 무효화하므로 변경 직후 첫 검색에서만 DB를 다시 읽는다.
  tags: ["lyra-content", "lyra-data", "lyra-moments"],
  revalidate: CACHE_TTL_SECONDS,
});

export async function contentRevision() {
  if (!databaseContentEnabled()) return "files";
  return cachedContentRevision();
}
