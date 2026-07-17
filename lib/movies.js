import fs from "fs";
import path from "path";
import { parseFrontmatter, parseLyrics } from "./songs";

// Movies mirror songs exactly: same frontmatter + interleaved-body format
// (memorable quotes take the place of lyric lines, `>` = translation). Only
// the directory and a few frontmatter fields differ, so the parsers are shared.
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
      // `quotes` reuses the lyric stanza shape; `rating` is a number for sorting/stats
      return {
        slug,
        ...meta,
        tags: meta.tags || [],
        rating: meta.rating ? Number(meta.rating) : null,
        quotes: parseLyrics(body),
      };
    })
    .sort((a, b) =>
      (b.published || b.date || "").localeCompare(a.published || a.date || "")
    );
}

export function getMovie(slug) {
  return getAllMovies().find((m) => m.slug === slug) || null;
}
