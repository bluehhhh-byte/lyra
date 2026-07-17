import Link from "next/link";
import { getAllMovies } from "../../lib/movies";

export const metadata = {
  title: "영화 | Lyra",
  description: "기억에 남는 영화와 명대사",
};

// ★ rating out of 5, half-star aware — a filled row clipped to the score width
function Stars({ value }) {
  if (!value) return null;
  return (
    <span className="relative inline-block align-middle text-xs leading-none" aria-label={`별점 ${value}/5`}>
      <span className="text-muted/30">★★★★★</span>
      <span
        className="absolute inset-0 overflow-hidden text-accent"
        style={{ width: `${(value / 5) * 100}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}

export default function MoviesPage() {
  const movies = getAllMovies();

  if (movies.length === 0) {
    return <p className="py-20 text-center text-sm text-muted">아직 영화가 없습니다.</p>;
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">영화</h1>
      <p className="mb-10 text-sm text-muted">{movies.length}편 · 기억에 남는 명대사</p>

      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {movies.map((m) => (
          <Link key={m.slug} href={`/movies/${m.slug}`} className="group block active:scale-[0.98] transition">
            {/* 2:3 poster — the movie-native aspect, not the square song artwork */}
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <img
                src={m.poster}
                alt={`${m.title_ko || m.title} 포스터`}
                loading="lazy"
                decoding="async"
                className="aspect-[2/3] w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
              />
            </div>
            <h3 className="mt-3 truncate text-sm font-semibold leading-snug group-hover:text-accent">
              {m.title_ko || m.title}
            </h3>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span className="truncate">
                {m.director_ko || m.director}
                {m.year ? ` · ${m.year}` : ""}
              </span>
            </p>
            {m.rating != null && (
              <div className="mt-1">
                <Stars value={m.rating} />
              </div>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
