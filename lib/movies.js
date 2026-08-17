import fs from "fs";
import path from "path";
import { parseFrontmatter } from "./songs.js";
import { parseThemes } from "./themes.js";
import { databaseContentEnabled, listCachedContentRows } from "./content-db.js";

// Movies share the songs' frontmatter format (parser reused), but the body is a
// Gemini-polished synopsis (줄거리) in plain Korean prose — split into paragraphs
// on blank lines — not the interleaved bilingual lyric format.
const MOVIES_DIR = path.join(process.cwd(), "movies");

// 곡과 같은 이유로 캐시 — 곡 페이지가 "이 시대의 영화"를 그리느라 매번 부른다.
// 개발 중에는 캐시하지 않는다 (lib/songs.js 참고).
let CACHE = null;

export function getAllMovies() {
  if (CACHE) return CACHE;
  const movies = readAllMovies();
  if (process.env.NODE_ENV === "production") CACHE = movies;
  return movies;
}

function readAllMovies() {
  if (!fs.existsSync(MOVIES_DIR)) return [];
  return fs
    .readdirSync(MOVIES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(MOVIES_DIR, f), "utf8").replace(/\r\n/g, "\n");
      return parseMovieRecord(slug, raw);
    })
    .sort((a, b) =>
      (b.published || b.date || "").localeCompare(a.published || a.date || "")
    );
}

function parseMovieRecord(slug, raw) {
  const { meta, body } = parseFrontmatter(raw);
  return {
    slug,
    ...meta,
    tags: meta.tags || [],
    themes: parseThemes(meta.themes),
    rating: meta.rating ? Number(meta.rating) : null,
    synopsis: body
      .trim()
      .split(/\n\s*\n/)
      .map((p) => p.split("\n").map((l) => l.replace(/^\s*[>+]\s?/, "")).join(" ").trim())
      .filter((p) => p && !/^\[.*\]$/.test(p)),
  };
}

export async function getAllMoviesRuntime() {
  if (!databaseContentEnabled()) return getAllMovies();
  const rows = await listCachedContentRows("movie");
  return rows
    .map((row) => parseMovieRecord(row.slug, row.raw.replace(/\r\n/g, "\n")))
    .sort((a, b) => (b.published || b.date || "").localeCompare(a.published || a.date || ""));
}

export async function getMovieRuntime(slug) {
  return (await getAllMoviesRuntime()).find((movie) => movie.slug === slug) || null;
}

export function getMovie(slug) {
  return getAllMovies().find((m) => m.slug === slug) || null;
}
