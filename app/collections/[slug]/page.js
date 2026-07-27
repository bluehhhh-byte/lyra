import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllCollections, getCollection } from "../../../lib/collections";
import { getAllMovies } from "../../../lib/movies";

export function generateStaticParams() {
  return getAllCollections().map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({ params }) {
  const collection = getCollection(decodeURIComponent((await params).slug));
  if (!collection) return {};
  return {
    title: `${collection.title} | Syno.`,
    description: collection.description || `${collection.title} 영화·드라마 컬렉션`,
  };
}

export default async function CollectionPage({ params }) {
  const collection = getCollection(decodeURIComponent((await params).slug));
  if (!collection) notFound();
  const bySlug = new Map(getAllMovies().map((movie) => [movie.slug, movie]));
  const movies = collection.movieSlugs.map((slug) => bySlug.get(slug)).filter(Boolean);

  return (
    <>
      <header className="mb-12 max-w-2xl">
        <p className="mb-2 text-xs tabular-nums text-muted">{movies.length}편의 큐레이션</p>
        <h1 className="text-3xl font-bold">{collection.title}</h1>
        {collection.description && (
          <p className="mt-4 text-base leading-relaxed text-muted">{collection.description}</p>
        )}
      </header>

      <ol className="divide-y divide-line border-y border-line">
        {movies.map((movie, index) => (
          <li key={movie.slug}>
            <Link
              href={`/movies/${movie.slug}`}
              className="group grid grid-cols-[32px_82px_minmax(0,1fr)] items-center gap-4 py-5 sm:grid-cols-[44px_110px_minmax(0,1fr)] sm:gap-6"
            >
              <span className="self-start pt-1 font-mono text-sm tabular-nums text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <img
                src={movie.poster}
                alt={`${movie.title_ko || movie.title} 포스터`}
                className="aspect-[2/3] w-full rounded border border-line object-cover"
              />
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold group-hover:text-accent">
                  {movie.title_ko || movie.title}
                </h2>
                <p className="mt-1 truncate text-xs text-muted">
                  {[movie.director_ko || movie.director, movie.year, movie.genre].filter(Boolean).join(" · ")}
                </p>
                {movie.comment && (
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{movie.comment}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ol>

      <Link href="/collections" className="mt-10 inline-block text-sm text-muted hover:text-accent">
        ← 컬렉션 목록
      </Link>
    </>
  );
}
