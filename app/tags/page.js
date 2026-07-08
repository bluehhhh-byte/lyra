import Link from "next/link";
import { getAllSongs, getAllTags } from "../../lib/songs";

export const metadata = { title: "태그 | Lyra", description: "태그로 둘러보는 가사 컬렉션" };

export default function TagsPage() {
  const songs = getAllSongs();
  const counts = new Map(getAllTags().map((t) => [t, 0]));
  for (const s of songs) for (const t of s.tags) counts.set(t, counts.get(t) + 1);

  // biggest tags first so the collection's shape is visible at a glance
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = tags[0]?.[1] || 1;

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">태그</h1>
      <p className="mb-8 text-sm text-muted">
        {tags.length}개 태그 · {songs.length}곡
      </p>
      <div className="flex flex-wrap gap-2">
        {tags.map(([tag, n]) => (
          <Link
            key={tag}
            href={`/?tag=${encodeURIComponent(tag)}`}
            // scale the type with usage — a tag on 8 songs should read bigger than one on 1
            className={`rounded-full border border-line bg-surface px-3.5 py-1.5 transition hover:border-accent hover:text-accent ${
              n / max > 0.66 ? "text-base" : n / max > 0.33 ? "text-sm" : "text-xs"
            }`}
          >
            {tag}
            <span className="ml-1.5 text-xs text-muted">{n}</span>
          </Link>
        ))}
      </div>
      {tags.length === 0 && <p className="py-20 text-center text-sm text-muted">아직 태그가 없습니다.</p>}
    </>
  );
}
