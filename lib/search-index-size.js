export const SEARCH_INDEX_WARN_BYTES = 2.5 * 1024 * 1024;

export function searchIndexSizeWarning(bytes, limit = SEARCH_INDEX_WARN_BYTES) {
  if (bytes <= limit) return "";
  const mb = (bytes / 1024 / 1024).toFixed(2);
  const limitMb = (limit / 1024 / 1024).toFixed(2);
  return `⚠ 검색 인덱스 ${mb}MB — 경고 기준 ${limitMb}MB 초과 (생성은 계속됨)`;
}
