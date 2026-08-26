export function urlHealth(status) {
  if (status >= 200 && status < 400) return "alive";
  if (status === 401 || status === 403 || status === 405 || status === 429) return "blocked";
  return "dead";
}

export function correctionUrlInventory(items) {
  return items.map((item, index) => ({
    index,
    slug: String(item.slug || ""),
    url: String(item.sourceUrl || "").trim(),
  }));
}
