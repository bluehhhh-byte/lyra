import { bytesOf, normalizeBrowserUsage } from "./usage-metrics-core.js";

let schemaPromise;

export async function ensureUsageSchema(sql) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`
        create table if not exists lyra_usage_buckets (
          bucket timestamptz primary key,
          vercel_page_views bigint not null default 0,
          vercel_transfer_bytes bigint not null default 0,
          neon_reads bigint not null default 0,
          neon_transfer_bytes bigint not null default 0,
          updated_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists lyra_usage_path_buckets (
          bucket timestamptz not null,
          path text not null,
          cache_status text not null,
          views bigint not null default 0,
          primary key (bucket, path, cache_status)
        )
      `;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

async function increment(sql, { pageViews = 0, vercelBytes = 0, neonReads = 0, neonBytes = 0 }) {
  await ensureUsageSchema(sql);
  await sql`
    insert into lyra_usage_buckets
      (bucket, vercel_page_views, vercel_transfer_bytes, neon_reads, neon_transfer_bytes)
    values (
      to_timestamp(floor(extract(epoch from now()) / 300) * 300),
      ${pageViews}, ${vercelBytes}, ${neonReads}, ${neonBytes}
    )
    on conflict (bucket) do update set
      vercel_page_views = lyra_usage_buckets.vercel_page_views + excluded.vercel_page_views,
      vercel_transfer_bytes = lyra_usage_buckets.vercel_transfer_bytes + excluded.vercel_transfer_bytes,
      neon_reads = lyra_usage_buckets.neon_reads + excluded.neon_reads,
      neon_transfer_bytes = lyra_usage_buckets.neon_transfer_bytes + excluded.neon_transfer_bytes,
      updated_at = now()
  `;
}
export async function recordBrowserUsage(sql, input) {
  const usage = normalizeBrowserUsage(input);
  if (!usage) return false;
  await increment(sql, {
    pageViews: usage.pageViews,
    vercelBytes: usage.transferBytes,
  });
  await sql`
    insert into lyra_usage_path_buckets (bucket, path, cache_status, views)
    values (to_timestamp(floor(extract(epoch from now()) / 300) * 300), ${usage.path}, ${usage.cacheStatus}, ${usage.pageViews})
    on conflict (bucket, path, cache_status) do update set
      views = lyra_usage_path_buckets.views + excluded.views
  `;
  return true;
}

export async function recordNeonRead(sql, value) {
  await increment(sql, { neonReads: 1, neonBytes: bytesOf(value) });
}

export async function readUsageSeries(sql, hours = 168) {
  await ensureUsageSchema(sql);
  const safeHours = Math.max(1, Math.min(24 * 31, Number(hours) || 168));
  return sql`
    select bucket,
           vercel_page_views::float8 as vercel_page_views,
           vercel_transfer_bytes::float8 as vercel_transfer_bytes,
           neon_reads::float8 as neon_reads,
           neon_transfer_bytes::float8 as neon_transfer_bytes
    from lyra_usage_buckets
    where bucket >= now() - (${safeHours} * interval '1 hour')
    order by bucket
  `;
}

export async function readUsagePaths(sql, hours = 168) {
  await ensureUsageSchema(sql);
  const safeHours = Math.max(1, Math.min(24 * 31, Number(hours) || 168));
  return sql`
    select path, cache_status, sum(views)::float8 as views
    from lyra_usage_path_buckets
    where bucket >= now() - (${safeHours} * interval '1 hour')
    group by path, cache_status
    order by views desc
    limit 100
  `;
}
