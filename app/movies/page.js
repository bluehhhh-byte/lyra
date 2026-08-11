import { getAllMovies } from "../../lib/movies";
import MovieBrowse from "./browse";

export const metadata = {
  title: "Syno. | Lyra",
  description: "좋아하는 영화와 줄거리·감상",
};

export default async function MoviesPage({ searchParams }) {
  const { q, group, media, country, genre, rating, sort } = (await searchParams) || {};
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
      country: m.tags.find((tag) => tag !== m.genre && !/^\d{4}s?$/.test(tag)) || "기타",
      media: m.media === "tv" ? "tv" : "movie",
      poster: m.poster,
      rating: m.rating,
      recorded: m.published || m.date || "",
      synopsis,
      metaSearch,
      search: [metaSearch, synopsis.join(" ").toLowerCase()].join(" "),
    };
  });

  if (movies.length === 0) {
    return <p className="py-20 text-center text-sm text-muted">아직 영화가 없습니다.</p>;
  }

  // 헤더 로고가 이미 Syno. 라 페이지 제목 없음 — 홈(Lyra)과 같은 시작
  return <MovieBrowse movies={movies} initial={{ q: q || "", media: media || "all", sort: sort || "recorded" }} />;
}
