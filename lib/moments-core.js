const LIST_LIMIT = 12;

export const MOMENT_EMOTIONS = [
  "사랑", "그리움", "고독", "불안", "체념", "상실", "위로", "희망", "해방", "성장",
];

export function momentSlug(title, startDate = "") {
  const base = `${startDate} ${title}`
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || `moment-${Date.now()}`;
}

export function parseMomentList(value, limit = LIST_LIMIT) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))].slice(0, limit);
}

export function normalizeMoment(input, existingSlug = "") {
  const title = String(input.title || "").trim();
  const body = String(input.body || "").trim();
  const startDate = String(input.startDate || "").trim();
  const endDate = String(input.endDate || "").trim();
  if (!title) throw new Error("장면 제목을 입력하세요");
  if (!body) throw new Error("장면의 기억을 입력하세요");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("시작 날짜를 선택하세요");
  if (endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate))
    throw new Error("종료 날짜는 시작 날짜 이후여야 합니다");

  const links = (Array.isArray(input.links) ? input.links : [])
    .map((link, position) => ({
      targetKind: link.targetKind === "movie" ? "movie" : "song",
      targetSlug: String(link.targetSlug || "").trim(),
      excerpt: String(link.excerpt || "").trim().slice(0, 500),
      note: String(link.note || "").trim().slice(0, 500),
      position,
    }))
    .filter((link) => link.targetSlug);
  const uniqueLinks = [...new Map(links.map((link) => [`${link.targetKind}:${link.targetSlug}`, link])).values()];
  if (!uniqueLinks.length) throw new Error("노래나 영화를 하나 이상 연결하세요");

  return {
    slug: existingSlug || momentSlug(title, startDate),
    title,
    body,
    startDate,
    endDate: endDate || "",
    emotions: parseMomentList(input.emotions),
    keywords: parseMomentList(input.keywords),
    published: input.published !== false,
    links: uniqueLinks,
  };
}

export function momentDateLabel(moment) {
  if (!moment?.startDate) return "";
  const start = moment.startDate.replace(/-/g, ".");
  const end = moment.endDate && moment.endDate !== moment.startDate
    ? ` — ${moment.endDate.replace(/-/g, ".")}`
    : "";
  return `${start}${end}`;
}
