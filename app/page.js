import Link from "next/link";
import { getAllSongs, getAllTags } from "../lib/songs";

export default async function Home({ searchParams }) {
  const { tag } = await searchParams;
  const songs = getAllSongs().filter((s) => !tag || s.tags.includes(tag));
  const tags = getAllTags();

  return (
    <>
      <div className="mb-10 flex flex-wrap gap-2">
        <FilterChip href="/" active={!tag} label="전체" />
        {tags.map((t) => (
          <FilterChip key={t} href={`/?tag=${encodeURIComponent(t)}`} active={tag === t} label={t} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {songs.map((s) => (
          <Link key={s.slug} href={`/songs/${s.slug}`} className="group">
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {/* iTunes artwork is remote; plain img keeps config zero */}
              <img
                src={s.artwork}
                alt={`${s.title} album art`}
                className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              />
            </div>
            <h2 className="mt-3 text-sm font-semibold leading-snug group-hover:text-accent">
              {s.title}
            </h2>
            <p className="mt-0.5 text-xs text-muted">{s.artist}</p>
          </Link>
        ))}
      </div>

      {songs.length === 0 && (
        <p className="py-20 text-center text-sm text-muted">
          아직 곡이 없습니다. <code>npm run add</code>로 첫 곡을 추가하세요.
        </p>
      )}
    </>
  );
}

function FilterChip({ href, active, label }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? "border-accent bg-accent font-semibold text-bg"
          : "border-line text-muted hover:border-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
