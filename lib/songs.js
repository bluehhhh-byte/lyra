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
    // 번역만 있는 문단 — 캡션이 원문 문단을 쓰고 빈 줄 뒤에 번역 문단을 이어 쓴 형태다.
    // 줄 순서를 바꾸지 않고 표기만 했으므로 여기서 앞 문단의 번역 없는 줄에 넘겨준다.
    // (넘길 곳이 없으면 그대로 한 문단으로 남긴다 — 번역을 잃지 않는다.)
    if (current.lines.length && current.lines.every((l) => !l.en && l.ko)) {
      const prev = stanzas[stanzas.length - 1];
      const free = prev ? prev.lines.filter((l) => !l.ko && !l.koMerged) : [];
      if (free.length) {
        current.lines.forEach((l, i) => { if (free[i]) free[i].ko = l.ko; });
        const left = current.lines.slice(free.length);
        current = { section: null, lines: left, note: current.note };
        if (!left.length) return;
      }
    }
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
    } else if (line.startsWith("//") || /^[🗨✏]/u.test(line)) {
      // 🗨·✏로 시작하는 줄은 인스타 캡션에 같이 적어 둔 본인 해설이다. 가사 자리에
      // 그대로 두면 원문과 같은 크기·글꼴로 나와 가사처럼 읽힌다 — 연 해설로 보낸다.
      current.note += (current.note ? " " : "") + line.replace(/^(\/\/|[🗨✏])\s?/u, "");
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
      // 묶음이 둘 이상이면 블록형이다 — 위에서부터 짝을 맞춘다. 번역이 원문보다
      // 적으면 뒤쪽 반복 줄이 앞 번역에 흡수된 경우가 대부분이라 아래를 비운다.
      // 하나뿐이면 바로 위 줄에 붙인다 — 애드립처럼 번역을 건너뛴 줄이 위에 있어도
      // 마지막 자리에 들어가야 맞다.
      // 묶음이 가리키는 원문 자리 수 = 각 줄의 span 합
      let need = 0;
      for (let t = 0; t < k; t++) need += Number((src[i + t].match(/^>\^(\d+)/) || [])[1] || 1);
      // 묶음이 둘 이상이면 블록형 — 위에서부터. 하나뿐이면 바로 위 need개에 붙인다.
      const slots = k > 1 ? free : free.slice(Math.max(0, free.length - need));
      let at = 0; // 다음에 채울 원문 자리
      for (let t = 0; t < k; t++) {
        const raw = src[i + t];
        const span = Number((raw.match(/^>\^(\d+)/) || [])[1] || 1);
        const text = raw.replace(/^>(\^\d+)?\s?/, "");
        // `>^N`은 자리를 N개 먹는다 — 번역은 마지막 자리에 붙고 앞 N-1개는 '덮임'.
        const take = slots.slice(at, at + span);
        at += span;
        const l = take.length ? take[take.length - 1] : last();
        // 붙일 원문이 없으면(번역만 있는 문단) 번역만 든 줄로 담아 둔다 — flush가
        // 앞 문단으로 넘긴다. 넘기지 못해도 화면에는 번역이 남는다.
        if (!l || !l.en) { current.lines.push({ en: "", ko: text }); continue; }
        l.ko = text;
        if (span > 1) {
          l.koSpan = span;
          if (take.length < span) l.koSpanError = true; // 가리킬 원문이 모자람
          for (const m of take.slice(0, -1)) m.koMerged = true;
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
  return splitInline(stanzas);
}

// 한 줄에 "원문 번역"이 같이 적힌 곡 — 캡션에서 줄바꿈 없이 이어 쓴 것이다.
// 그대로 두면 원문과 번역이 같은 크기·같은 글꼴로 붙어 나와 구분이 안 된다.
// 파일은 그대로 두고(원문 보존) 화면에 낼 때만 원문/번역으로 나눈다.
//
// 한국어 곡 가사에도 "I'm young 달콤한 나이"처럼 두 언어가 한 줄에 섞이는데,
// 그건 번역이 아니라 가사 그 자체다. 그래서 줄 하나만 보고 자르지 않고,
// 곡 전체에서 이 형태가 절반을 넘을 때만(=번역해 둔 외국곡) 자른다.
// 자를 자리: 첫 한글 앞. 여는 괄호·따옴표는 번역 쪽에 딸려 보낸다
//   "(Where are the locks?) (열쇠는 어디에?)" → 원문 "(Where are the locks?)"
const cut = (text) => {
  const i = text.search(/[가-힣]/);
  if (i <= 0) return null;
  let j = i;
  while (j > 0 && /[(\["'“‘]/.test(text[j - 1])) j--;   // 여는 괄호는 번역 쪽
  const src = text.slice(0, j).trim();
  const ko = text.slice(j).trim();
  if (!src || !ko || !/\s$|^\s/.test(text.slice(j - 1, j + 1)) && j === i) {
    // 원문과 번역 사이에 공백이 있어야 한 줄에 이어 쓴 것이다
    if (!/\s/.test(text[j - 1] || "")) return null;
  }
  return { en: src, ko };
};

// 곡 판정용(엄격) — 이 형태가 곡의 절반을 넘어야 '번역해 둔 외국곡'으로 본다
const strictPair = (text) => {
  const t = (text || "").trim();
  if (!/^[^가-힣]{8,}?\s+[(\["'“‘]?[가-힣]/.test(t)) return null;
  const p = cut(t);
  if (!p) return null;
  if (p.en.split(/\s+/).length < 2) return null;             // 낱말 하나는 감탄사일 뿐
  if ((p.ko.match(/[가-힣]/g) || []).length < 3) return null; // 한글이 짧으면 가사 일부
  return p;
};

// 판정이 끝난 곡 안에서 쓰는 완화 규칙 — "Superfantastic 완전 멋져 보여"처럼
// 원문이 한 낱말인 줄도 같은 형식이다
const loosePair = (text) => {
  const t = (text || "").trim();
  const p = cut(t);
  if (!p) return null;
  if (p.en.replace(/[^A-Za-z぀-ヿ㐀-鿿]/g, "").length < 3) return null;
  if ((p.ko.match(/[가-힣]/g) || []).length < 2) return null;
  return p;
};

function splitInline(stanzas) {
  const lines = stanzas.flatMap((st) => st.lines).filter((l) => l.en?.trim() && !/^[🗨✏]/u.test(l.en.trim()));
  const hits = lines.filter((l) => !l.ko && strictPair(l.en));
  if (hits.length < 3 || hits.length / lines.length < 0.5) return stanzas;
  for (const l of lines) {
    if (l.ko) continue;
    const p = loosePair(l.en);
    if (p) { l.en = p.en; l.ko = p.ko; continue; }
    // 한글로 시작하는 줄은 앞줄 번역이 이어진 것이다 (캡션에서 줄을 안 나눈 흔적) —
    // 원문 자리에 두면 가사처럼 보이므로 번역 쪽으로 옮긴다
    if (/^[가-힣]/.test(l.en.trim())) { l.ko = l.en.trim(); l.en = ""; }
  }
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
