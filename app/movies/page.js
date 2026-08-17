import { getAllMoviesRuntime } from "../../lib/movies";
import MovieBrowse from "./browse";
import SynoNav from "../syno-nav";

export const metadata = {
  title: "Syno. | Lyra",
  description: "좋아하는 영화와 줄거리·감상",
};

export default async function MoviesPage({ searchParams }) {
  const { q, group, media, country, genre, rating, sort } = (await searchParams) || {};
  const movies = (await getAllMoviesRuntime()).map((m) => {
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

  // 헤더 로고가 이미 Syno. 라 페이지 제목 없음 — 홈(Lyra)과 같은 시작.
  // 서브내비는 목록이 비어도 그대로 둔다 — 별점 쪽으로 가는 길은 항상 있어야 한다.
  return (
    <>
      <SynoNav active="movies" />
      {movies.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted">아직 영화가 없습니다.</p>
      ) : (
        <MovieBrowse movies={movies} initial={{ q: q || "", media: media || "all", sort: sort || "recorded" }} />
      )}
    </>
  );
}
