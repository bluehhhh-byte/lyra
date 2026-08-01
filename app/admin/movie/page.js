import Link from "next/link";
import { getAllMovies } from "../../../lib/movies";
import MovieForm from "../movie-form";
import MovieTools from "../movie-tools";
import CollectionManager from "../collection-manager";
import WatchaImport from "../watcha-import";
import { getAllCollections } from "../../../lib/collections";

export const metadata = { title: "Syno. 관리 | Lyra" };
export const dynamic = "force-dynamic"; // auth-gated, never prerender

export default function MovieAdminPage() {
  const movies = getAllMovies();
  const collectionMovies = movies.map((movie) => ({
    slug: movie.slug,
    title: movie.title_ko || movie.title,
    director: movie.director_ko || movie.director || "",
    year: movie.year || "",
    poster: movie.poster,
  }));
  return (
    <>
      <div className="mb-8 flex items-center gap-4">
        <h1 className="text-2xl font-bold">Syno<span className="text-accent">.</span></h1>
        <Link href="/admin" className="text-sm text-muted transition hover:text-accent">
          → 곡 관리로
        </Link>
      </div>
      <MovieForm />

      <h2 className="mb-1 mt-16 text-lg font-bold">왓챠피디아 가져오기</h2>
      <p className="mb-3 text-xs text-muted">
        왓챠 평가·코멘트 페이지에서 뽑은 JSON을 붙여넣으면 별점·코멘트를 채웁니다
      </p>
      <WatchaImport />

      <h2 className="mb-3 mt-16 text-lg font-bold">큐레이션 컬렉션</h2>
      <CollectionManager movies={collectionMovies} collections={getAllCollections({ includePrivate: true })} />

      <h2 className="mb-3 mt-16 text-lg font-bold">등록된 작품 ({movies.length})</h2>
      <MovieTools
        movies={movies.map((m) => ({
          slug: m.slug,
          title: m.title_ko || m.title,
          director: m.director_ko || m.director,
          poster: m.poster,
          media: m.media || "movie",
          rating: m.rating,
          watchStatus: m.watchStatus,
          platform: m.platform || "",
          episode: m.episode,
          started: m.started || "",
          watched: m.watched || "",
          comment: m.comment || "",
        }))}
      />
    </>
  );
}
