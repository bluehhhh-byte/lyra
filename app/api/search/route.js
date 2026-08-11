import { getAllSongs } from "../../../lib/songs";
import { getAllMovies } from "../../../lib/movies";
import { getAllPeople } from "../../../lib/people";
import { getWatched } from "../../../lib/watched";
import { tmdbUrl } from "../../../lib/tmdb-link";

export const dynamic = "force-dynamic";

const includes = (value, query) => String(value || "").toLowerCase().includes(query);

export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
  if (!query) return Response.json({ groups: [] });

  const songs = getAllSongs()
    .map((song) => {
      const metadata = [song.title, song.title_ko, song.artist, song.artist_ko, song.album, ...(song.tags || [])];
      const lyric = song.stanzas
        .flatMap((stanza) => stanza.lines.flatMap((line) => [line.en, line.ko]))
        .find((line) => includes(line, query));
      return metadata.some((value) => includes(value, query)) || lyric
        ? {
            href: `/songs/${song.slug}`,
            title: song.title,
            subtitle: song.artist,
            image: song.artwork,
            snippet: lyric || "",
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 6);

  const allMovies = getAllMovies();
  const movies = allMovies
    .filter((movie) =>
      [
        movie.title, movie.title_ko, movie.director, movie.director_ko,
        movie.cast, movie.comment, movie.synopsis.join(" "), ...(movie.tags || []),
      ].some((value) => includes(value, query))
    )
    .slice(0, 6)
    .map((movie) => ({
      href: `/movies/${movie.slug}`,
      title: movie.title_ko || movie.title,
      subtitle: movie.director_ko || movie.director,
      image: movie.poster,
    }));


  // 평가한 왓챠 영화 1045편 — 개별 페이지가 없어 TMDB로 링크. 위 .md 영화와
  // tmdbId가 겹치면(같은 작품) 뺀다.
  const mdTmdb = new Set(allMovies.map((m) => String(m.tmdbId)).filter(Boolean));
  const watched = getWatched()
    .filter((m) => m.rating != null && !mdTmdb.has(String(m.tmdbId)))
    .filter((m) =>
      [m.title, m.title_ko, m.director, m.director_ko, ...(Array.isArray(m.cast) ? m.cast : [m.cast])]
        .some((value) => includes(value, query))
    )
    .slice(0, 6)
    .map((m) => ({
      href: tmdbUrl(m.tmdbId, m.media),
      title: m.title_ko || m.title,
      subtitle: [m.director_ko || m.director, m.year, m.rating != null ? `★${m.rating}` : ""].filter(Boolean).join(" · "),
      image: m.poster,
    }));

  const people = getAllPeople()
    .filter((person) => includes(person.name, query))
    .slice(0, 6)
    .map((person) => ({
      href: `/people/${encodeURIComponent(person.name)}`,
      title: person.name,
      subtitle: `${person.directed.length ? `감독 ${person.directed.length}편` : ""}${person.directed.length && person.acted.length ? " · " : ""}${person.acted.length ? `출연 ${person.acted.length}편` : ""}`,
    }));

  return Response.json({
    groups: [
      ["음악", songs],
      ["영화·드라마", movies],
      ["평가한 영화", watched],
      ["인물", people],
    ].filter(([, items]) => items.length),
  });
}
