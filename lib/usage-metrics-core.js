export const USAGE_BUCKET_MINUTES = 5;
export const USAGE_SAMPLE_RATE = 0.1;
export const USAGE_SAMPLE_WEIGHT = Math.round(1 / USAGE_SAMPLE_RATE);

export const USAGE_LIMITS = Object.freeze({
  vercelTransferBytes: 100_000_000_000,
  neonTransferBytes: 5_000_000_000,
  neonStorageBytes: 500_000_000,
});

const MAX_PAGE_BYTES = 50 * 1024 * 1024;

export function normalizeBrowserUsage(input) {
  const bytes = Number(input?.bytes);
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  return {
    pageViews: USAGE_SAMPLE_WEIGHT,
    transferBytes: Math.round(Math.min(bytes, MAX_PAGE_BYTES) * USAGE_SAMPLE_WEIGHT),
  };
}

export function bytesOf(value) {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
}

export function usagePercent(value, limit) {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, Math.min(100, (value / limit) * 100));
}
