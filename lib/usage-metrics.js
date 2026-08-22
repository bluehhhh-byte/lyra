import { databaseContentEnabled, getContentDb } from "./content-db.js";
import { ensureUsageSchema, readUsageSeries, recordBrowserUsage } from "./usage-metrics-db.js";
import { USAGE_LIMITS, USAGE_SAMPLE_RATE } from "./usage-metrics-core.js";

const clean = (value) => String(value ?? "").replace(/^\uFEFF/, "").trim().replace(/^(\"|')(.*)\1$/, "$2").trim();

let neonProviderCache = { at: 0, value: null };

async function readNeonProviderUsage(sql) {
  const apiKey = clean(process.env.NEON_API_KEY);
  if (!apiKey)
    return { configured: false, error: "NEON_API_KEY를 설정하면 월 누적 전송량이 표시됩니다." };

  let projectId = clean(process.env.NEON_PROJECT_ID);
  if (!projectId) {
    const rows = await sql`select current_setting('neon.project_id', true) as project_id`;
    projectId = clean(rows[0]?.project_id);
  }
  if (!projectId) return { configured: true, error: "Neon 프로젝트 ID를 확인하지 못했습니다." };

  if (neonProviderCache.value && Date.now() - neonProviderCache.at < 30_000)
    return neonProviderCache.value;

  try {
    const response = await fetch(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Neon API ${response.status}`);
    const body = await response.json();
    const value = {
      configured: true,
      dataTransferBytes: Number(body.project?.data_transfer_bytes || 0),
    };
    neonProviderCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    return { configured: true, error: error.message || "Neon API 조회 실패" };
  }
}

const sum = (rows, key, since) => rows.reduce((total, row) =>
  new Date(row.bucket).getTime() >= since ? total + Number(row[key] || 0) : total, 0);

export async function saveBrowserUsage(input) {
  if (!databaseContentEnabled()) return false;
  return recordBrowserUsage(getContentDb(), input);
}

export async function getUsageDashboard() {
  if (!databaseContentEnabled())
    return { generatedAt: new Date().toISOString(), enabled: false, series: [], limits: USAGE_LIMITS };

  const sql = getContentDb();
  await ensureUsageSchema(sql);
  const [rows, database, neonProvider] = await Promise.all([
    readUsageSeries(sql, 168),
    sql`select pg_database_size(current_database())::float8 as bytes`,
    readNeonProviderUsage(sql),
  ]);
  const series = rows.map((row) => ({
    at: new Date(row.bucket).toISOString(),
    vercelPageViews: Number(row.vercel_page_views || 0),
    vercelTransferBytes: Number(row.vercel_transfer_bytes || 0),
    neonReads: Number(row.neon_reads || 0),
    neonTransferBytes: Number(row.neon_transfer_bytes || 0),
  }));
  const now = Date.now();
  const totalsFor = (hours) => {
    const since = now - hours * 60 * 60 * 1000;
    return {
      vercelPageViews: sum(rows, "vercel_page_views", since),
      vercelTransferBytes: sum(rows, "vercel_transfer_bytes", since),
      neonReads: sum(rows, "neon_reads", since),
      neonTransferBytes: sum(rows, "neon_transfer_bytes", since),
    };
  };
  return {
    generatedAt: new Date().toISOString(),
    enabled: true,
    sampleRate: USAGE_SAMPLE_RATE,
    limits: USAGE_LIMITS,
    databaseBytes: Number(database[0]?.bytes || 0),
    totals24h: totalsFor(24),
    totals7d: totalsFor(168),
    series,
    neonProvider,
    vercelProvider: {
      exactAvailable: false,
      note: "Vercel Hobby는 Usage API를 제공하지 않아 브라우저 표본으로 추정합니다.",
    },
  };
}
