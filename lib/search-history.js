export const SEARCH_RECENT_KEY = "lyra_recent_searches";
export const SEARCH_RECENT_LIMIT = 5;

export function readRecentSearches(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(SEARCH_RECENT_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((value) => String(value).trim()).filter(Boolean))].slice(0, SEARCH_RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function rememberRecentSearch(storage, current, rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return current;
  const next = [value, ...current.filter((item) => item !== value)].slice(0, SEARCH_RECENT_LIMIT);
  try {
    storage?.setItem(SEARCH_RECENT_KEY, JSON.stringify(next));
  } catch {
    // 사생활 보호 모드·용량 제한에서도 메모리의 최근 검색 UI는 계속 동작한다.
  }
  return next;
}
