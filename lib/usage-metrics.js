import { databaseContentEnabled, getContentDb } from "./content-db.js";
import { ensureUsageSchema, readUsagePaths, readUsageSeries, recordBrowserUsage } from "./usage-metrics-db.js";
import { readResearchDashboard } from "./admin/research-budget-db.js";
import { DEFAULT_APPEARANCE_AI_DAILY_LIMIT, researchDailyLimit } from "./admin/research-budget.js";
import {
  estimateUploadCapacity,
  usagePercent,
  usageStatus,
  USAGE_SAMPLE_RATE,
  usageLimits,
  usageMetricsEnabled,
} from "./usage-metrics-core.js";
import { readVercelUsage, vercelLimits } from "./vercel-usage.js";

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
  // 계측이 꺼져 있으면 방문자 요청이 DB를 건드리지 않는다 — 라우트에서도 막지만
  // 저장 함수 자체가 닫혀 있어야 다른 호출자가 생겨도 새지 않는다.
  if (!usageMetricsEnabled()) return false;
  if (!databaseContentEnabled()) return false;
  return recordBrowserUsage(getContentDb(), input);
}

export async function getUsageDashboard() {
  const limits = usageLimits();
  if (!databaseContentEnabled())
    return { generatedAt: new Date().toISOString(), enabled: false, series: [], limits };

  // 계측이 꺼진 상태에서도 화면은 정상 동작해야 한다. 자체 표본은 비우고
  // 공급자 쪽 수치(Neon API)와 DB 크기처럼 write 없이 읽을 수 있는 값만 보여준다.
  const metricsOn = usageMetricsEnabled();

  const sql = getContentDb();
  // 스키마 보장과 표본 조회는 계측이 켜져 있을 때만 — 꺼진 상태에서 관리자 화면을
  // 여는 것만으로 테이블을 만들거나 읽지 않는다.
  if (metricsOn) await ensureUsageSchema(sql);
  const configuredResearchLimit = Number(process.env.APPEARANCE_AI_DAILY_LIMIT);
  const researchLimit = researchDailyLimit(Number.isFinite(configuredResearchLimit) ? configuredResearchLimit : DEFAULT_APPEARANCE_AI_DAILY_LIMIT);
  const [rows, pathRows, database, content, neonProvider, aiResearch] = await Promise.all([
    metricsOn ? readUsageSeries(sql, 168) : Promise.resolve([]),
    metricsOn ? readUsagePaths(sql, 168) : Promise.resolve([]),
    sql`select pg_database_size(current_database())::float8 as bytes`,
    sql`
      select count(*)::float8 as rows,
             coalesce(sum(octet_length(raw)), 0)::float8 as bytes
      from lyra_contents
      where kind in ('song', 'movie')
    `,
    readNeonProviderUsage(sql),
    readResearchDashboard(sql, { limit: researchLimit }),
  ]);
  // 공급자 실측은 실패해도 대시보드를 막지 않는다 — readVercelUsage가 모든
  // 실패를 measured:false로 수렴시키므로 여기서 따로 감싸지 않는다.
  const vercelUsage = await readVercelUsage({ env: process.env });
  const series = rows.map((row) => ({
    at: new Date(row.bucket).toISOString(),
    vercelPageViews: Number(row.vercel_page_views || 0),
    vercelTransferBytes: Number(row.vercel_transfer_bytes || 0),
    neonReads: Number(row.neon_reads || 0),
    neonTransferBytes: Number(row.neon_transfer_bytes || 0),
  }));
  const pathMap = new Map();
  for (const row of pathRows) {
    if (!pathMap.has(row.path)) pathMap.set(row.path, { path: row.path, hit: 0, miss: 0, unknown: 0 });
    pathMap.get(row.path)[String(row.cache_status || "UNKNOWN").toLowerCase()] += Number(row.views || 0);
  }
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
  const databaseBytes = Number(database[0]?.bytes || 0);
  const neonTransferBytes = Number(neonProvider.dataTransferBytes || totalsFor(168).neonTransferBytes || 0);
  const capacity = estimateUploadCapacity({
    contentBytes: Number(content[0]?.bytes || 0),
    contentRows: Number(content[0]?.rows || 0),
    transferUsed: neonTransferBytes,
    transferLimit: limits.neonTransferBytes,
  });
  const configuredPercentages = [
    limits.neonTransferBytes && usagePercent(neonTransferBytes, limits.neonTransferBytes),
    limits.neonStorageBytes && usagePercent(databaseBytes, limits.neonStorageBytes),
  ].filter(Number.isFinite);
  const status = configuredPercentages.length
    ? usageStatus(configuredPercentages)
    : { level: "unknown", label: "한도 미설정", highest: null };

  return {
    generatedAt: new Date().toISOString(),
    enabled: true,
    // 자체 표본 계측이 도는 중인지. false면 series·totals는 비어 있고,
    // 화면에 보이는 수치는 공급자 값과 DB 크기뿐이다.
    metricsEnabled: metricsOn,
    sampleRate: metricsOn ? USAGE_SAMPLE_RATE : 0,
    limits,
    databaseBytes,
    contentRows: Number(content[0]?.rows || 0),
    capacity,
    status,
    totals24h: totalsFor(24),
    totals7d: totalsFor(168),
    series,
    cachePaths: [...pathMap.values()].sort((a, b) => b.miss - a.miss || b.hit - a.hit).slice(0, 20),
    neonProvider,
    aiResearch,
    // 예전에는 "Usage API가 없다"고 단정했는데, 2026-09-11에 확인하니
    // GET /v1/usage는 실재한다(from·to ISO 필수). 다만 토큰이 있어야 읽히고,
    // 못 읽으면 추정치로 돌아간다 — 그 사실을 source로 함께 내보내 화면이
    // 실측과 추정을 다른 문구로 쓰게 한다.
    vercelProvider: {
      ...vercelUsage,
      exactAvailable: vercelUsage.measured === true,
      limits: vercelLimits(process.env),
      note: vercelUsage.measured
        ? "Vercel Usage API 실측값입니다."
        : `${vercelUsage.error || "실측 불가"} — 브라우저 표본 기반 추정치를 표시합니다.`,
    },
  };
}
