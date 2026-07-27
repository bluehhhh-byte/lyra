import Link from "next/link";
import { getAllMovies } from "../../lib/movies";

export const metadata = {
  title: "워치리스트 | Syno.",
  description: "보고 싶거나 보는 중인 영화와 드라마",
};

const STATUS = {
  wishlist: "보고 싶음",
  watching: "보는 중",
  dropped: "중단",
};

export default function WatchlistPage() {
  const movies = getAllMovies().filter((movie) => movie.watchStatus !== "watched");
  const groups = ["watching", "wishlist", "dropped"]
    .map((status) => [status, movies.filter((movie) => movie.watchStatus === status)])
    .filter(([, items]) => items.length);

  return (
    <>
      <div className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">워치리스트</h1>
          <p className="mt-1 text-sm text-muted">다음에 볼 것과 아직 보고 있는 것</p>
        </div>
        <Link href="/movies" className="text-sm text-muted hover:text-accent">전체 작품 →</Link>
      </div>

      {groups.length ? groups.map(([status, items]) => (
        <section key={status} className="mb-12">
          <h2 className="mb-4 text-sm font-semibold">{STATUS[status]} · {items.length}</h2>
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((movie) => (
              <Link key={movie.slug} href={`/movies/${movie.slug}`} className="group">
                <img src={movie.poster} alt="" className="aspect-[2/3] w-full rounded border border-line object-cover" />
                <h3 className="mt-2 truncate text-sm font-semibold group-hover:text-accent">{movie.title_ko || movie.title}</h3>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {movie.platform || movie.director_ko || movie.director}
                  {status === "watching" && movie.episode ? ` · ${movie.episode}화` : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )) : (
        <p className="border-y border-line py-20 text-center text-sm text-muted">대기 중인 작품이 없습니다.</p>
      )}
    </>
  );
}
