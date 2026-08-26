// 검색 인덱스 생성 — 빌드 때 한 번 돌고, 검색 API는 이 파일만 읽는다.
//   node scripts/build-search-index.mjs
//
// 곡이 800편에 가까워지면서 검색 요청마다 md 800개 + 영화 50편 + 왓챠 1045편을
// 다시 파싱하는 건 낭비다. 검색에 필요한 건 "어떤 글자가 들어 있나"와 화면에 띄울
// 몇 개 필드뿐이라, 그것만 미리 눌러 담는다.
//
// haystack: 검색 대상 문자열을 소문자로 이어붙인 것. 가사는 원문·번역을 줄 단위로
// 따로 들고 있어야 스니펫(맞은 줄)을 보여줄 수 있으므로 lines에 남긴다.
import fs from "fs";
import { getAllSongs } from "../lib/songs.js";
import { getAllMovies } from "../lib/movies.js";
import { getAllPeople } from "../lib/people.js";
import { getWatched } from "../lib/watched.js";
import { tmdbUrl } from "../lib/tmdb-link.js";
import { appleUrl } from "../lib/apple.js";
import { searchableLyricLines } from "../lib/lyric-search.js";

const low = (v) => String(v || "").toLowerCase();
const join = (...v) => v.flat().filter(Boolean).map(low).join("  ");

const songs = getAllSongs().map((s) => ({
  href: `/songs/${s.slug}`,
  title: s.title,
  subtitle: s.artist,
  image: s.artwork || "",
  meta: join(s.title, s.title_ko, s.artist, s.artist_ko, s.album, s.tags || []),
  lines: searchableLyricLines(s),
}));

const movies = getAllMovies();
const movieItems = movies.map((m) => ({
  href: `/movies/${m.slug}`,
  title: m.title_ko || m.title,
  subtitle: m.director_ko || m.director || "",
  image: m.poster || "",
  meta: join(m.title, m.title_ko, m.director, m.director_ko, m.cast, m.comment, (m.synopsis || []).join(" "), m.tags || []),
}));

const mdTmdb = new Set(movies.map((m) => String(m.tmdbId)).filter(Boolean));
const watched = getWatched()
  .filter((m) => m.rating != null && !mdTmdb.has(String(m.tmdbId)))
  .map((m) => ({
    href: tmdbUrl(m.tmdbId, m.media),
    title: m.title_ko || m.title,
    subtitle: [m.director_ko || m.director, m.year, m.rating != null ? `★${m.rating}` : ""].filter(Boolean).join(" · "),
    image: m.poster || "",
    meta: join(m.title, m.title_ko, m.director, m.director_ko, Array.isArray(m.cast) ? m.cast : [m.cast]),
  }));

const people = getAllPeople().map((p) => ({
  href: `/people/${encodeURIComponent(p.name)}`,
  title: p.name,
  subtitle: `${p.directed.length ? `감독 ${p.directed.length}편` : ""}${p.directed.length && p.acted.length ? " · " : ""}${p.acted.length ? `출연 ${p.acted.length}편` : ""}`,
  meta: low(p.name),
}));

const out = { songs, movies: movieItems, watched, people, at: new Date().toISOString() };
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/search-index.json", JSON.stringify(out));
const kb = Math.round(fs.statSync("data/search-index.json").size / 1024);
console.log(`검색 인덱스: 곡 ${songs.length} · 영화 ${movieItems.length} · 왓챠 ${watched.length} · 인물 ${people.length} — ${kb}KB`);

// 플레이어 목록도 같이 — /api/playlist가 첫 재생 때 한 번 가져간다
const items = getAllSongs()
  .filter((s) => s.preview)
  .map((s) => ({
    slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork, preview: s.preview,
    provider: s.preview_provider || "",
    externalUrl: appleUrl(s),
  }));
fs.writeFileSync("data/playlist.json", JSON.stringify({ items }));
console.log(`플레이어 목록: 미리듣기 있는 곡 ${items.length} — ${Math.round(fs.statSync("data/playlist.json").size / 1024)}KB`);
