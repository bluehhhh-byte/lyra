import { getAllSongsRuntime } from "../../../lib/songs";
import { getAllMoviesRuntime } from "../../../lib/movies";
import { getWatchedRuntime } from "../../../lib/watched";
import { getAllPeopleRuntime } from "../../../lib/people";
import { contentRevision } from "../../../lib/content-db";
import { getAllMomentsRuntime } from "../../../lib/moments";

export const dynamic = "force-dynamic";

const lower = (...values) => values.flat().filter(Boolean).join(" ").toLowerCase();

async function index() {
  const [songs, movies, watched, people, moments] = await Promise.all([
    getAllSongsRuntime(),
    getAllMoviesRuntime(),
    getWatchedRuntime(),
    getAllPeopleRuntime(),
    getAllMomentsRuntime(),
  ]);
  return {
    songs: songs.map((song) => {
      const lines = song.stanzas.flatMap((stanza) => stanza.lines.flatMap((line) => [line.en, line.ko])).filter(Boolean);
      return {
        href: `/songs/${song.slug}`,
        title: song.title,
        subtitle: song.artist,
        image: song.artwork,
        meta: lower(song.title, song.artist, song.tags, song.keywords, lines),
        lines,
      };
    }),
    movies: movies.map((movie) => ({
      href: `/movies/${movie.slug}`,
      title: movie.title_ko || movie.title,
      subtitle: movie.director_ko || movie.director || movie.year,
      image: movie.poster,
      meta: lower(movie.title, movie.title_ko, movie.director, movie.director_ko, movie.cast, movie.tags, movie.themes),
    })),
    watched: watched.map((movie) => ({
      href: movie.tmdbId ? `https://www.themoviedb.org/${movie.media === "tv" ? "tv" : "movie"}/${movie.tmdbId}` : "",
      title: movie.title_ko || movie.title,
      subtitle: movie.director_ko || movie.director || movie.year,
      image: movie.poster,
      meta: lower(movie.title, movie.title_ko, movie.director, movie.director_ko, movie.cast, movie.genre, movie.country),
    })),
    people: people.map((person) => ({
      href: `/people/${encodeURIComponent(person.name)}`,
      title: person.name,
      subtitle: `${person.works.length}편`,
      image: person.works.find((work) => work.poster)?.poster || "",
      meta: lower(person.name, person.works.map((work) => [work.title, work.title_ko])),
    })),
    moments: moments.map((moment) => ({
      href: `/moments/${moment.slug}`,
      title: moment.title,
      subtitle: moment.startDate,
      image: "",
      meta: lower(moment.title, moment.body, moment.emotions, moment.keywords),
    })),
  };
}

let INDEX = null;
let revisionCheckedAt = 0;
// revision 확인을 60초 캐시한다 — 예전에는 타이핑마다(검색 요청마다) Neon에
// revision 쿼리가 나갔다. 검색 인덱스가 최대 60초 늦는 것은 개인 아카이브에서
// 아무 문제가 아니고, 무료 컴퓨트 시간은 문제다.
const REVISION_TTL_MS = 60_000;
async function currentIndex() {
  if (INDEX && Date.now() - revisionCheckedAt < REVISION_TTL_MS) return INDEX.value;
  const revision = await contentRevision();
  revisionCheckedAt = Date.now();
  if (!INDEX || INDEX.revision !== revision) INDEX = { revision, value: await index() };
  return INDEX.value;
}

const LIMIT = 6;
const pick = (items, query) => {
  const out = [];
  for (const it of items) {
    if (!it.meta.includes(query)) continue;
    out.push({ href: it.href, title: it.title, subtitle: it.subtitle, image: it.image });
    if (out.length === LIMIT) break;
  }
  return out;
};

export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
  if (!query) return Response.json({ groups: [] });
  const db = await currentIndex();

  // 곡만 가사까지 본다 — 맞은 줄을 스니펫으로 보여주기 위해서다
  const songs = [];
  for (const s of db.songs) {
    const lyric = s.meta.includes(query)
      ? s.lines.find((l) => l.toLowerCase().includes(query)) || ""
      : s.lines.find((l) => l.toLowerCase().includes(query));
    if (!s.meta.includes(query) && !lyric) continue;
    songs.push({ href: s.href, title: s.title, subtitle: s.subtitle, image: s.image, snippet: lyric || "" });
    if (songs.length === LIMIT) break;
  }

  return Response.json({
    groups: [
      ["음악", songs],
      ["영화·드라마", pick(db.movies, query)],
      ["평가한 영화", pick(db.watched, query)],
      ["인물", pick(db.people, query)],
      ["문화 장면", pick(db.moments, query)],
    ].filter(([, items]) => items.length),
  });
}
