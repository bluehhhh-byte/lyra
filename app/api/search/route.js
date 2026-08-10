import { getAllSongs } from "../../../lib/songs";
import { getAllMovies } from "../../../lib/movies";
import { getAllPeople } from "../../../lib/people";

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

  const movies = getAllMovies()
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
      ["인물", people],
    ].filter(([, items]) => items.length),
  });
}
