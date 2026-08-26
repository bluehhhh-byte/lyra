export const USAGE_SAMPLE_RATE = 0.1;
export const USAGE_SAMPLE_WEIGHT = Math.round(1 / USAGE_SAMPLE_RATE);

// 자체 계측은 기본으로 꺼 둔다.
//
// 켜져 있던 동안 콘텐츠 DB read마다 lyra_usage_buckets에 upsert가 붙었다.
// 관측하려던 대상(Neon)을 관측 행위가 다시 깨우는 구조였고, 읽기 한 번이
// 왕복 두 번이 됐다. 브라우저 비콘도 표본 세션의 경로 변경마다 write를 만들었다.
//
// 무료 티어에서 계측 비용이 계측 가치보다 크다. 필요할 때만 LYRA_USAGE_METRICS=on으로
// 켜고, 평소에는 공급자 쪽 수치(Neon API, Vercel 대시보드)를 본다.
const cleanFlag = (value) => String(value ?? "").replace(/^﻿/, "").trim().replace(/^(["'])(.*)\1$/, "$2").trim().toLowerCase();

export function usageMetricsEnabled(env = process.env) {
  return ["on", "1", "true", "yes"].includes(cleanFlag(env.LYRA_USAGE_METRICS));
}

const positiveLimit = (value) => {
  const limit = Number(value);
  return Number.isFinite(limit) && limit > 0 ? limit : null;
};

export function usageLimits(env = process.env) {
  return {
    vercelTransferBytes: positiveLimit(env.VERCEL_TRANSFER_LIMIT_BYTES),
    neonTransferBytes: positiveLimit(env.NEON_TRANSFER_LIMIT_BYTES),
    neonStorageBytes: positiveLimit(env.NEON_STORAGE_LIMIT_BYTES),
  };
}

const MAX_PAGE_BYTES = 50 * 1024 * 1024;

export function normalizeBrowserUsage(input) {
  const bytes = Number(input?.bytes);
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  const path = String(input?.path || "/").split("?")[0].slice(0, 180);
  const cacheStatus = ["HIT", "MISS"].includes(input?.cacheStatus) ? input.cacheStatus : "UNKNOWN";
  return {
    pageViews: USAGE_SAMPLE_WEIGHT,
    transferBytes: Math.round(Math.min(bytes, MAX_PAGE_BYTES) * USAGE_SAMPLE_WEIGHT),
    path: path.startsWith("/") ? path : "/",
    cacheStatus,
  };
}

export function bytesOf(value) {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
}

export function usagePercent(value, limit) {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.min(100, (value / limit) * 100));
}

export function estimateUploadCapacity({
  contentBytes,
  contentRows,
  transferUsed,
  transferLimit,
  safetyRatio = 0.8,
}) {
  const rawBytes = Math.max(0, Number(contentBytes) || 0);
  const rows = Math.max(0, Number(contentRows) || 0);
  // A write expires the shared content cache. Allow for row fields and JSON framing
  // on the next full song + movie refresh, rather than counting raw text alone.
  const uploadBytes = Math.max(1, Math.ceil((rawBytes + rows * 96) * 1.05));
  const safeLimitBytes = Math.max(0, Number(transferLimit) || 0) * safetyRatio;
  const usedBytes = Math.max(0, Number(transferUsed) || 0);

  return {
    uploadBytes,
    safetyRatio,
    totalUploads: transferLimit ? Math.floor(safeLimitBytes / uploadBytes) : null,
    remainingUploads: transferLimit ? Math.floor(Math.max(0, safeLimitBytes - usedBytes) / uploadBytes) : null,
  };
}

export function usageStatus(percentages) {
  const highest = Math.max(0, ...percentages.filter(Number.isFinite));
  if (highest >= 85) return { level: "danger", label: "위험", highest };
  if (highest >= 70) return { level: "warning", label: "주의", highest };
  if (highest >= 50) return { level: "watch", label: "관찰", highest };
  return { level: "safe", label: "안정", highest };
}
