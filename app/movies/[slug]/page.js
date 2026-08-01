import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllMovies, getMovie } from "../../../lib/movies";
import YouTubeEmbed from "../../songs/[slug]/youtube-embed";
import MovieCardButton from "./movie-card";
import { splitCast } from "../../../lib/people";

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

// "2026년 7월 14일 22:03" in KST; drops the time for a date-only value
function formatPublished(v) {
  const d = new Date(v.length <= 10 ? `${v}T00:00:00+09:00` : v);
  if (isNaN(d)) return v;
  const withTime = v.length > 10;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(d);
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

const WATCH_STATUS = {
  wishlist: "보고 싶음",
  watching: "보는 중",
  watched: "감상 완료",
  dropped: "중단",
};

export default async function MoviePage({ params }) {
  const { slug } = await params;
  const all = getAllMovies();
  const movie = all.find((m) => m.slug === decodeURIComponent(slug));
  if (!movie) notFound();
  const related = relatedMovies(movie, all);

  const meta = [
    movie.year,
    movie.runtime ? `${movie.runtime}분` : "",
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
            <div className="mt-2 flex flex-wrap justify-center gap-x-2 gap-y-1 text-xs text-muted sm:justify-start">
              {(movie.director_ko || movie.director) && (
                <Link href={`/people/${encodeURIComponent(movie.director_ko || movie.director)}`} className="hover:text-accent">
                  감독 {movie.director_ko || movie.director}
                </Link>
              )}
              {splitCast(movie.cast).map((actor) => (
                <Link key={actor} href={`/people/${encodeURIComponent(actor)}`} className="hover:text-accent">
                  {actor}
                </Link>
              ))}
            </div>
            {movie.rating != null && (
              <div className="mt-3">
                <Stars value={movie.rating} />
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              {WATCH_STATUS[movie.watchStatus]}
              {movie.platform ? ` · ${movie.platform}` : ""}
              {movie.watchStatus === "watching" && movie.episode ? ` · ${movie.episode}화` : ""}
              {movie.watched ? ` · ${movie.watched}` : movie.started ? ` · ${movie.started} 시작` : ""}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {/* dead <span>s until the combined tag pages existed — now a year
                  tag walks to that year's songs AND films */}
              {movie.tags.map((t) => (
                <Link
                  key={t}
                  href={`/tags/${encodeURIComponent(t)}`}
                  className="rounded-full border border-line bg-bg/50 px-2.5 py-0.5 text-xs text-muted hover:text-accent"
                >
                  {t}
                </Link>
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
                  cast: movie.cast || "",
                  country: movie.tags?.[0] || "",
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
      {/* 감상문이 본문에 통째로 있으면 comment는 그 앞부분을 자른 요약일 뿐이라
          같은 문장이 두 번 보인다. 그때는 본문만 보여준다 (comment는 카드·OG용으로 유지). */}
      {movie.comment && !(movie.body_kind === "review" && movie.synopsis.length > 0) && (
        <p className="mx-auto mb-14 max-w-2xl border-l-2 border-accent pl-4 text-sm leading-relaxed text-muted">
          {movie.comment}
        </p>
      )}

      {/* synopsis — Gemini-polished 줄거리, prose paragraphs */}
      {movie.synopsis.length > 0 && (
        <div className="mx-auto max-w-2xl">
          {/* body_kind=review → 왓챠에서 옮겨온 내 감상문. 없으면 기존처럼 줄거리 */}
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-accent">
            {movie.body_kind === "review" ? "감상" : "줄거리"}
          </h2>
          <div className="space-y-4">
            {movie.synopsis.map((p, i) => (
              // 감상은 짧든 길든 같은 크기로 — 짧은 감상은 comment 인용구(text-sm)로
              // 렌더되므로, 본문도 거기 맞춘다. 줄거리는 기존 세리프 본문 그대로.
              <p
                key={i}
                className={
                  movie.body_kind === "review"
                    ? "text-sm leading-relaxed text-muted"
                    : "font-serif text-lg leading-relaxed"
                }
              >
                {p}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* when this entry went up — full datetime if recorded, else the date */}
      {(movie.published || movie.date) && (
        <p className="mx-auto mt-12 max-w-2xl text-right text-xs text-muted/60">
          <Link
            href={`/archive/${(movie.published || movie.date).slice(0, 10)}`}
            className="hover:text-accent"
          >
            기록 {formatPublished(movie.published || movie.date)}
          </Link>
        </p>
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
