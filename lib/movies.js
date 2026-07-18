import fs from "fs";
import path from "path";
import { parseFrontmatter } from "./songs";

// Movies share the songs' frontmatter format (parser reused), but the body is a
// Gemini-polished synopsis (줄거리) in plain Korean prose — split into paragraphs
// on blank lines — not the interleaved bilingual lyric format.
const MOVIES_DIR = path.join(process.cwd(), "movies");

export function getAllMovies() {
  if (!fs.existsSync(MOVIES_DIR)) return [];
  return fs
    .readdirSync(MOVIES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(MOVIES_DIR, f), "utf8").replace(/\r\n/g, "\n");
      const { meta, body } = parseFrontmatter(raw);
      return {
        slug,
        ...meta,
        tags: meta.tags || [],
        rating: meta.rating ? Number(meta.rating) : null,
        // blank-line-separated paragraphs, drop any leftover `>`/`[..]` markers
        synopsis: body
          .trim()
          .split(/\n\s*\n/)
          .map((p) => p.split("\n").map((l) => l.replace(/^\s*[>+]\s?/, "")).join(" ").trim())
          .filter((p) => p && !/^\[.*\]$/.test(p)),
      };
    })
    .sort((a, b) =>
      (b.published || b.date || "").localeCompare(a.published || a.date || "")
    );
}

export function getMovie(slug) {
  return getAllMovies().find((m) => m.slug === slug) || null;
}
