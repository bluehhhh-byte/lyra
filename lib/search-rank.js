const normalize = (value) => String(value || "").trim().toLowerCase();
const CHOSEONG = [..."ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"];
const CHOSEONG_SET = new Set(CHOSEONG);

export function hangulInitials(value) {
  const out = [];
  for (const char of String(value || "")) {
    const code = char.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) out.push(CHOSEONG[Math.floor((code - 0xac00) / 588)]);
    else if (CHOSEONG_SET.has(char)) out.push(char);
  }
  return out.join("");
}

const isInitialQuery = (query) => query.length > 0 && [...query].every((char) => CHOSEONG_SET.has(char));
const containsInOrder = (text, query) => {
  let index = 0;
  for (const char of text) if (char === query[index]) index += 1;
  return index === query.length;
};

export function searchScore(item, rawQuery) {
  const query = normalize(rawQuery);
  if (!query) return 0;
  const title = normalize(item.title);
  const subtitle = normalize(item.subtitle);
  const meta = normalize(item.meta);
  const initial = isInitialQuery(query);
  const titleInitials = initial ? hangulInitials(title) : "";
  const subtitleInitials = initial ? hangulInitials(subtitle) : "";
  const metaInitials = initial ? hangulInitials(meta) : "";
  const initialMatch = initial && [titleInitials, subtitleInitials, metaInitials].some((value) => containsInOrder(value, query));
  if (!meta.includes(query) && !title.includes(query) && !subtitle.includes(query) && !initialMatch) return 0;

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
  if (initial) {
    if (titleInitials === query) score += 90;
    else if (titleInitials.startsWith(query)) score += 65;
    else if (titleInitials.includes(query)) score += 45;
    else if (containsInOrder(titleInitials, query)) score += 30;
    if (subtitleInitials.includes(query)) score += 15;
    else if (containsInOrder(subtitleInitials, query)) score += 8;
  }
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
