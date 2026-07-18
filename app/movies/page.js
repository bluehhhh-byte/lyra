import { getAllMovies } from "../../lib/movies";
import MovieBrowse from "./browse";

export const metadata = {
  title: "Syno. | Lyra",
  description: "좋아하는 영화와 줄거리·감상",
};

export default async function MoviesPage({ searchParams }) {
  const { q, group } = (await searchParams) || {};
  const movies = getAllMovies().map((m) => {
    const title = m.title_ko || m.title;
    const director = m.director_ko || m.director || "";
    const synopsis = m.synopsis || [];
    const metaSearch = [
      m.title,
      m.title_ko,
      m.director,
      m.director_ko,
      m.cast,
      m.year,
      m.genre,
      m.tags.join(" "),
      m.comment,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      slug: m.slug,
      title,
      director,
      year: m.year || "",
      genre: m.genre || "",
      poster: m.poster,
      rating: m.rating,
      synopsis,
      metaSearch,
      search: [metaSearch, synopsis.join(" ").toLowerCase()].join(" "),
    };
  });

  if (movies.length === 0) {
    return <p className="py-20 text-center text-sm text-muted">아직 영화가 없습니다.</p>;
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">Syno<span className="text-accent">.</span></h1>
      <p className="mb-6 text-sm text-muted">{movies.length}편 · 영화 줄거리와 감상</p>
      <MovieBrowse movies={movies} initialQ={q || ""} initialGroup={group || "none"} />
    </>
  );
}
