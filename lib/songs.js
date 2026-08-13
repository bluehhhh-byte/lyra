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
  const src = body.split("\n").map((l) => l.trimEnd());
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    const last = () => current.lines[current.lines.length - 1];
    if (!line.trim()) {
      flush();
    } else if (line.startsWith("//")) {
      current.note += (current.note ? " " : "") + line.replace(/^\/\/\s?/, "");
    } else if (line.startsWith("[") && line.endsWith("]")) {
      flush();
      current.section = line.slice(1, -1);
    } else if (line.startsWith(">")) {
      // 연속된 `>`는 한 묶음으로 본다. 원본 캡션은 원문 여러 줄을 쓰고 그 아래 번역
      // 여러 줄을 잇는 '블록' 형태가 많은데, 줄 순서를 바꾸지 않고 표기만 하면 `>`가
      // 연달아 나온다. 하나씩 바로 윗줄에 붙이면 앞 번역이 덮여 사라진다.
      // 묶음 k개는 바로 위에 이어진 '번역 없는 원문' 줄들의 뒤에서 k개에 차례로 넣는다:
      //   1:1이면 결과가 종전과 같고, 블록이면 위에서부터 짝이 맞는다.
      let k = 0;
      while (i + k < src.length && src[i + k].startsWith(">")) k++;
      const free = [];
      for (let j = current.lines.length - 1; j >= 0; j--) {
        if (current.lines[j].ko || current.lines[j].koMerged) break;
        free.unshift(current.lines[j]);
      }
      const slots = free.slice(Math.max(0, free.length - k));
      for (let t = 0; t < k; t++) {
        const raw = src[i + t];
        const span = Number((raw.match(/^>\^(\d+)/) || [])[1] || 1);
        const text = raw.replace(/^>(\^\d+)?\s?/, "");
        const l = span > 1 ? last() : slots[t] || last();
        if (!l) continue;
        l.ko = text;
        if (span > 1) {
          l.koSpan = span;
          if (span > current.lines.length) l.koSpanError = true;
          for (let m = Math.max(0, current.lines.length - span); m < current.lines.length - 1; m++)
            current.lines[m].koMerged = true;
        }
      }
      i += k - 1;
    } else if (line.startsWith("+")) {
      if (last()) last().reading = line.replace(/^\+\s?/, "");
    } else {
      current.lines.push({ en: line, ko: "" });
    }
  }
  flush();
  return stanzas;
}

// 곡 800편을 넘기면서 이 함수의 비용이 눈에 띄기 시작했다 — 곡 페이지 하나가
// 관련 곡·컬렉션 위치·시대별 영화까지 그리느라 여러 번 부르고, 빌드는 그 페이지를
// 800번 만든다. 파일이 안 바뀌는 프로덕션 빌드·서버에서는 한 번만 읽는다.
// 개발 중에는 캐시하지 않는다 — md를 고치고 새로고침하면 바로 보여야 한다.
let CACHE = null;

export function getAllSongs() {
  if (CACHE) return CACHE;
  const songs = readAllSongs();
  if (process.env.NODE_ENV === "production") CACHE = songs;
  return songs;
}

function readAllSongs() {
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
