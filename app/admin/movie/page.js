import Link from "next/link";
import { getAllMovies } from "../../../lib/movies";
import MovieForm from "../movie-form";
import MovieTools from "../movie-tools";

export const metadata = { title: "Syno. 관리 | Lyra" };
export const dynamic = "force-dynamic"; // auth-gated, never prerender

export default function MovieAdminPage() {
  const movies = getAllMovies();
  return (
    <>
      <div className="mb-8 flex items-center gap-4">
        <h1 className="text-2xl font-bold">Syno<span className="text-accent">.</span></h1>
        <Link href="/admin" className="text-sm text-muted transition hover:text-accent">
          → 곡 관리로
        </Link>
      </div>
      <MovieForm />

      <h2 className="mb-3 mt-16 text-lg font-bold">등록된 작품 ({movies.length})</h2>
      <MovieTools
        movies={movies.map((m) => ({
          slug: m.slug,
          title: m.title_ko || m.title,
          director: m.director_ko || m.director,
          poster: m.poster,
          media: m.media || "movie",
          rating: m.rating,
          comment: m.comment || "",
        }))}
      />
    </>
  );
}
