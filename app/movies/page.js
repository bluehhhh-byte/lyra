import { getAllMovies } from "../../lib/movies";
import MovieBrowse from "./browse";
import Link from "next/link";

export const metadata = {
  title: "Syno. | Lyra",
  description: "좋아하는 영화와 줄거리·감상",
};

export default async function MoviesPage({ searchParams }) {
  const { q, group, media, country, genre, rating, sort, status } = (await searchParams) || {};
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
      watchStatus: m.watchStatus,
      platform: m.platform || "",
      episode: m.episode,
      recorded: m.published || m.date || "",
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
      {/* 헤더 로고가 이미 Syno. 라 여기 제목은 중복 — 링크만 남긴다 */}
      <div className="mb-4 flex items-baseline justify-end">
        <Link href="/collections" className="text-sm text-muted hover:text-accent">컬렉션 →</Link>
      </div>
      <MovieBrowse
        movies={movies}
        initial={{
          q: q || "",
          group: group || "none",
          media: media || "all",
          country: country || "all",
          genre: genre || "all",
          rating: rating || "0",
          sort: sort || "recorded",
          status: status || "all",
        }}
      />
    </>
  );
}
