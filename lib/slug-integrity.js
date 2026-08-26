export const canonicalSlug = (...parts) =>
  parts
    .filter((part) => part !== null && part !== undefined)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
    .replace(/^-|-$/g, "");

export function auditSlugs(songs, movies) {
  const songSlugs = new Set(songs.map((item) => item.slug));
  const crossCollisions = movies.filter((item) => songSlugs.has(item.slug)).map((item) => item.slug).sort();
  const regenerated = [
    ...songs.map((item) => ({ kind: "song", slug: item.slug, expected: canonicalSlug(item.artist, item.title) })),
    ...movies.map((item) => ({ kind: "movie", slug: item.slug, expected: canonicalSlug(item.title, item.year) })),
  ].filter((item) => item.expected && item.slug !== item.expected);
  return { crossCollisions, regenerated };
}
