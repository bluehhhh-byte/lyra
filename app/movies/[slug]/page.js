import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllMovies, getMovie } from "../../../lib/movies";
import YouTubeEmbed from "../../songs/[slug]/youtube-embed";
import MovieCardButton from "./movie-card";

export function generateStaticParams() {
  return getAllMovies().map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const m = getMovie(decodeURIComponent(slug));
  if (!m) return {};
  const title = `${m.title_ko || m.title} (${m.year})`;
  const description = m.comment || `${m.title} 줄거리와 감상`;
  return {
    title: `${title} | Lyra`,
    description,
    openGraph: { title, description, images: m.backdrop ? [{ url: m.backdrop }] : [], type: "article" },
  };
}

function Stars({ value }) {
  if (!value) return null;
  return (
    <span className="relative inline-block align-middle text-base leading-none" aria-label={`별점 ${value}/5`}>
      <span className="text-muted/30">★★★★★</span>
      <span className="absolute inset-0 overflow-hidden text-accent" style={{ width: `${(value / 5) * 100}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

function relatedMovies(movie, all) {
  const tags = new Set(movie.tags);
  return all
    .filter((m) => m.slug !== movie.slug)
    .map((m) => {
      let score = 0;
      if (m.director === movie.director) score += 5;
      score += m.tags.filter((t) => tags.has(t)).length;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.m);
}

export default async function MoviePage({ params }) {
  const { slug } = await params;
  const all = getAllMovies();
  const movie = all.find((m) => m.slug === decodeURIComponent(slug));
  if (!movie) notFound();
  const related = relatedMovies(movie, all);

  const meta = [
    movie.director_ko || movie.director,
    movie.year,
    movie.runtime ? `${movie.runtime}분` : "",
    movie.cast,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article>
      {/* hero — 16:9 backdrop wash behind a 2:3 poster */}
      <div className="relative mb-12 overflow-hidden rounded-2xl border border-line">
        <img
          src={movie.backdrop || movie.poster}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-30 blur-2xl"
        />
        <div className="relative flex flex-col items-center gap-6 px-6 py-12 sm:flex-row sm:items-end sm:px-10">
          <img
            src={movie.poster}
            alt={`${movie.title_ko || movie.title} 포스터`}
            className="w-40 rounded-xl shadow-2xl sm:w-48"
          />
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{movie.title_ko || movie.title}</h1>
            {movie.title_ko && movie.title_ko !== movie.title && (
              <p className="mt-1 text-lg text-muted">{movie.title}</p>
            )}
            <p className="mt-2 text-sm text-muted">{meta}</p>
            {movie.rating != null && (
              <div className="mt-3">
                <Stars value={movie.rating} />
              </div>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {movie.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-line bg-bg/50 px-2.5 py-0.5 text-xs text-muted"
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <YouTubeEmbed artist={movie.director || ""} title={`${movie.title} 예고편`} />
              <MovieCardButton
                movie={{
                  slug: movie.slug,
                  title: movie.title_ko || movie.title,
                  year: movie.year || "",
                  director: movie.director_ko || movie.director || "",
                  genre: movie.genre || "",
                  poster: movie.poster,
                  rating: movie.rating,
                  synopsis: movie.synopsis.join(" "),
                }}
              />
              {movie.tmdbId && (
                <a
                  href={`https://www.themoviedb.org/movie/${movie.tmdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-line bg-bg/50 px-3 py-1.5 text-xs text-muted transition active:scale-[0.97] hover:text-accent"
                >
                  TMDB
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* comment — personal take */}
      {movie.comment && (
        <p className="mx-auto mb-14 max-w-2xl border-l-2 border-accent pl-4 text-sm leading-relaxed text-muted">
          {movie.comment}
        </p>
      )}

      {/* synopsis — Gemini-polished 줄거리, prose paragraphs */}
      {movie.synopsis.length > 0 && (
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-accent">줄거리</h2>
          <div className="space-y-4">
            {movie.synopsis.map((p, i) => (
              <p key={i} className="font-serif text-lg leading-relaxed">
                {p}
              </p>
            ))}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div className="mx-auto mt-20 max-w-2xl">
          <h2 className="mb-4 text-sm font-semibold text-muted">이런 영화도</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
            {related.map((m) => (
              <Link key={m.slug} href={`/movies/${m.slug}`} className="group block active:scale-[0.98] transition">
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  <img
                    src={m.poster}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-[2/3] w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
                  />
                </div>
                <h3 className="mt-2 truncate text-xs font-medium group-hover:text-accent">
                  {m.title_ko || m.title}
                </h3>
                <p className="truncate text-xs text-muted">{m.director_ko || m.director}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto mt-16 flex max-w-2xl justify-between">
        <Link href="/movies" className="text-sm text-muted transition hover:text-accent">
          ← 영화 목록
        </Link>
      </div>
    </article>
  );
}
