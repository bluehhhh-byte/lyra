export const DETAIL_REVALIDATE_SECONDS = 21600;
export const STATIC_SONG_LIMIT = 100;

const recordedAt = (item) => item.published || item.date || "";

export function recentStaticParams(items, limit = items.length) {
  return [...items]
    .sort((a, b) => recordedAt(b).localeCompare(recordedAt(a)))
    .slice(0, limit)
    .map(({ slug }) => ({ slug }));
}
