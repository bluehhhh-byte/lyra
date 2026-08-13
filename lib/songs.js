import fs from "fs";
import path from "path";

const SONGS_DIR = path.join(process.cwd(), "songs");

// ponytail: hand-rolled frontmatter parser — our own controlled format, no gray-matter dep.
// exported so lib/movies.js reuses the exact same frontmatter + interleaved-body format.
export function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      val = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    meta[key] = val;
  }
  return { meta, body: m[2] };
}

// English lyrics are capitalized per line — lrclib emits them that way and the
// whole collection follows it, but a hand-typed body usually doesn't. Uppercase
// the first letter of every line so a manually entered song matches the
// auto-loaded ones.
//
// Leading punctuation is skipped, which is the same convention the corpus
// already uses: "'cause" -> "'Cause", "(ooh)" -> "(Ooh)". That also carries the
// `> ` / `+ ` / `// ` / `[` markers, so an English translation under a Korean
// line gets capitalized too.
//
// Korean, Japanese and digits are caseless, so this is a no-op for every line
// that isn't Latin — no language check needed.
export const capitalizeLyricLines = (text) =>
  (text || "")
    .split("\n")
    .map((line) =>
      line.replace(/^([^\p{L}\p{N}]*)(\p{Ll})/u, (whole, before, ch) => {
        const up = ch.toUpperCase();
        // A few letters have no single-character uppercase: the ﬁ ligature
        // becomes "FI" and ß becomes "SS", which would render "ﬁre" as "FIre".
        // Lyrics pasted out of a PDF do carry ligatures — leaving the character
        // alone beats mangling the word. (Surrogate pairs are unaffected: an
        // astral lowercase letter maps to an equally long uppercase one.)
        return up.length === ch.length ? before + up : whole;
      })
    )
    .join("\n");

// Lyrics body format:
//   [Verse 1]          -> section header
//   original line      (English, Japanese, ...)
//   + 요미가나/독음      -> optional pronunciation reading of the line above
//   > 한글 번역          -> translation of the line above
//   >^2 한글 번역        -> ONE translation covering the 2 original lines above
//   // 해설             -> analysis note for the current stanza
//   (blank line)       -> stanza break
//
// `>^N` exists because the source captions often merge several original lines
// into a single sentence of translation. Attaching it to the last line only
// (plain `>`) leaves the earlier lines looking untranslated, which the data lint
// then reports as missing work. The covered lines carry `koMerged` so the lint
// can tell "covered by the line below" apart from "nobody translated this".
// N larger than the lines available in the stanza is kept as `koSpanError` —
// parsing must not throw (it runs on every page render); the lint errors on it.
export function parseLyrics(body) {
  const stanzas = [];
  let current = { section: null, lines: [], note: "" };
  const flush = () => {
    if (current.lines.length || current.section || current.note)
      stanzas.push(current);
    current = { section: null, lines: [], note: "" };
  };
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const last = () => current.lines[current.lines.length - 1];
    if (!line.trim()) {
      flush();
    } else if (line.startsWith("//")) {
      current.note += (current.note ? " " : "") + line.replace(/^\/\/\s?/, "");
    } else if (line.startsWith("[") && line.endsWith("]")) {
      flush();
      current.section = line.slice(1, -1);
    } else if (line.startsWith(">")) {
      const span = Number((line.match(/^>\^(\d+)/) || [])[1] || 1);
      if (last()) {
        const l = last();
        l.ko = line.replace(/^>(\^\d+)?\s?/, "");
        if (span > 1) {
          l.koSpan = span;
          if (span > current.lines.length) l.koSpanError = true;
          // the N-1 lines above are covered by this one translation
          for (let k = Math.max(0, current.lines.length - span); k < current.lines.length - 1; k++)
            current.lines[k].koMerged = true;
        }
      }
    } else if (line.startsWith("+")) {
      if (last()) last().reading = line.replace(/^\+\s?/, "");
    } else {
      current.lines.push({ en: line, ko: "" });
    }
  }
  flush();
  return stanzas;
}

export function getAllSongs() {
  if (!fs.existsSync(SONGS_DIR)) return [];
  return fs
    .readdirSync(SONGS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      // Normalize CRLF: git's autocrlf checks these out with \r\n on Windows, which
      // makes the /^---\n/ frontmatter match (and the line prefixes) miss entirely.
      const raw = fs.readFileSync(path.join(SONGS_DIR, f), "utf8").replace(/\r\n/g, "\n");
      const { meta, body } = parseFrontmatter(raw);
      return { slug, ...meta, tags: meta.tags || [], stanzas: parseLyrics(body) };
    })
    // published carries the exact time; date is day-only, so same-day songs
    // would otherwise tie and fall back to filename order
    .sort((a, b) =>
      (b.published || b.date || "").localeCompare(a.published || a.date || "")
    );
}

export function getSong(slug) {
  return getAllSongs().find((s) => s.slug === slug) || null;
}

export function getAllTags() {
  const tags = new Set();
  for (const s of getAllSongs()) for (const t of s.tags) tags.add(t);
  return [...tags].sort();
}
