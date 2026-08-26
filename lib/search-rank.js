const normalize = (value) => String(value || "").trim().toLowerCase();

export function searchScore(item, rawQuery) {
  const query = normalize(rawQuery);
  if (!query) return 0;
  const title = normalize(item.title);
  const subtitle = normalize(item.subtitle);
  const meta = normalize(item.meta);
  if (!meta.includes(query) && !title.includes(query) && !subtitle.includes(query)) return 0;

  let score = 10;
  if (title === query) score += 100;
  else if (title.startsWith(query)) score += 70;
  else if (title.includes(query)) score += 45;
  if (subtitle === query) score += 50;
  else if (subtitle.startsWith(query)) score += 30;
  else if (subtitle.includes(query)) score += 20;
  const tokens = query.split(/\s+/).filter(Boolean);
  score += tokens.filter((token) => title.includes(token)).length * 8;
  score += tokens.every((token) => meta.includes(token)) ? 5 : 0;
  return score;
}

export function rankedSearch(items, query, limit = 6) {
  return items
    .map((item, index) => ({ item, index, score: searchScore(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export const SEARCH_SORTS = ["relevance", "recent", "year"];

export function sortSearchResults(items, query, sort = "relevance") {
  return items
    .map((item, index) => ({ item, index, score: searchScore({ ...item, subtitle: item.subtitle || item.artist, meta: item.meta || item.metaSearch }, query) }))
    .sort((a, b) => {
      if (sort === "recent") {
        const av = String(a.item.published || a.item.date || a.item.recorded || "");
        const bv = String(b.item.published || b.item.date || b.item.recorded || "");
        return bv.localeCompare(av) || a.index - b.index;
      }
      if (sort === "year") return Number(b.item.year || 0) - Number(a.item.year || 0) || a.index - b.index;
      return b.score - a.score || a.index - b.index;
    })
    .map((entry) => entry.item);
}
