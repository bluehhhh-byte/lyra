import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllSongs } from "../../../lib/songs";
import { getAllMovies } from "../../../lib/movies";

// One tag, both collections — clicking 2004 shows that year's songs AND films
// side by side. Static: every tag in use gets a page at build time.

const tagged = (tag) => ({
  songs: getAllSongs().filter((s) => s.tags.includes(tag)),
  movies: getAllMovies().filter((m) => m.tags.includes(tag)),
});

export function generateStaticParams() {
  const tags = new Set();
  for (const s of getAllSongs()) for (const t of s.tags) tags.add(t);
  for (const m of getAllMovies()) for (const t of m.tags) tags.add(t);
  return [...tags].map((tag) => ({ tag }));
}

export async function generateMetadata({ params }) {
  const { tag } = await params;
  return { title: `${decodeURIComponent(tag)} | Lyra` };
}

export default async function TagPage({ params }) {
  const tag = decodeURIComponent((await params).tag);
  const { songs, movies } = tagged(tag);
  if (songs.length === 0 && movies.length === 0) notFound();

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">
        {tag}
        <span className="ml-3 text-base font-normal text-muted">
          {[songs.length && `${songs.length}곡`, movies.length && `${movies.length}편`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </h1>
      <p className="mb-10 text-sm text-muted">이 태그가 붙은 음악과 영화</p>

      {songs.length > 0 && (
        <section className="mb-14">
          <h2 className="mb-4 text-sm font-semibold text-muted">음악</h2>
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {songs.map((s) => (
              <Link key={s.slug} href={`/songs/${s.slug}`} className="group">
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <img
                    src={s.artwork.replace("600x600bb", "300x300bb")}
                    srcSet={`${s.artwork.replace("600x600bb", "300x300bb")} 1x, ${s.artwork} 2x`}
                    alt={`${s.title} album art`}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
                  />
                </div>
                <h3 className="mt-2.5 text-sm font-semibold leading-snug group-hover:text-accent">
                  {s.title}
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  {s.artist}
                  {s.year ? ` · ${s.year}` : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {movies.length > 0 && (
        <section className="mb-14">
          <h2 className="mb-4 text-sm font-semibold text-muted">영화·드라마</h2>
          <div className="grid grid-cols-3 gap-x-5 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
            {movies.map((m) => (
              <Link key={m.slug} href={`/movies/${m.slug}`} className="group">
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  {/* poster is 2:3, not square — don't force the album ratio */}
                  <img
                    src={m.poster}
                    alt={`${m.title} poster`}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[2/3] w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
                  />
                </div>
                <h3 className="mt-2.5 truncate text-sm font-semibold group-hover:text-accent">
                  {m.title_ko || m.title}
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  {m.year}
                  {m.rating ? ` · ★${m.rating}` : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Link href="/tags" className="text-sm text-muted hover:text-accent">
        ← 전체 태그
      </Link>
    </>
  );
}
