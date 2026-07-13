import { readSong, writeSong, deleteSong } from "../../../lib/store";
import { getAllSongs } from "../../../lib/songs";

// per-request work is one song's lyric lookup (native chain hits iTunes+lrclib
// a few times); 30s is ample and stays within hobby-plan limits.
export const maxDuration = 30;

async function geminiText(key, prompt, json = false) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  });
  // Gemini free tier throws intermittent 503 "high demand" / 429 spikes — retry
  // with backoff so a single blip doesn't fail comment/translation generation.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } else if (res.status < 500 && res.status !== 429) {
        return ""; // 400/401 etc. — a retry won't help
      }
    } catch {}
    if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  return "";
}

// Kanji-or-kana artist names get a Korean reading; latin ones legitimately don't.
export const needsReading = (artist) => /[぀-ヿ㐀-鿿]/.test(artist || "");

const commentPrompt = (title, artist, lyrics) =>
  `노래 "${title}" (${artist})에 대한 개인 음악 블로그용 코멘트를 한국어 1~2문장으로 써줘. 가사의 의미와 이 곡에 얽힌 실제 배경·일화를 녹여서. 반드시 평서문 '~다'체(예: ~한다, ~이다, ~같다, ~된다)로 끝맺을 것. "~습니다/~합니다/~해요/~함/~음" 금지. 담백한 톤. 코멘트 문장만 출력.\n가사:\n${(lyrics || "").slice(0, 2000)}`;

// Line-aware bilingual output — one song may mix Korean, English and Japanese
// lines (K-pop verse with an English hook, a Japanese bridge). Each line is
// annotated toward "the other side": Korean → English, English/Japanese →
// Korean (+ 독음 for Japanese). The parser and the renderer are already
// per-line, so a single interleaved pass covers any mix; `lang` is only a hint.
async function translateLyrics(key, { title, artist, lang, lyrics }) {
  const prompt = `You are annotating song lyrics for a bilingual (Korean-centered) lyrics blog. A single song may mix Korean, English and Japanese lines.
Song: "${title}" by ${artist}. Primary language hint: ${lang || "unknown"}.

For EACH lyric line, decide the line's dominant language, then output SEPARATE LINES (each annotation MUST start on its own new line — never append it to the original line):
- Korean line →
  1. the original line as-is
  2. "> " + a natural English translation
- English line →
  1. the original line as-is
  2. "> " + a natural Korean translation
- Japanese line →
  1. the original line as-is
  2. "+ " + the Korean pronunciation reading (한글 독음) of the line
  3. "> " + a natural Korean translation
- A line mixing languages → judge by its dominant language and translate the WHOLE line (including the foreign words) by the rule above.

Rules:
- Keep section headers like [Verse 1] or [サビ] as-is on their own line. If a header is not bracketed, wrap it in brackets.
- Keep blank lines between stanzas.
- Translate naturally and poetically, preserving metaphor and tone. Not word-for-word.
- Output ONLY the interleaved lyrics, no commentary, no code fences.

Lyrics:
${lyrics}`;
  return normalizeInterleaved(await geminiText(key, prompt));
}

// Safety net: Gemini occasionally appends the annotation to the original line
// ("Come on > 어서 와") instead of starting a new one — the parser then treats
// the whole thing as an original lyric. Split inline " > " / " + " markers back
// onto their own lines. ponytail: a lyric legitimately containing " > " or " + "
// would be over-split — hasn't happened in practice.
function normalizeInterleaved(text) {
  return (text || "")
    .split("\n")
    .flatMap((line) =>
      /^\s*[>+\[]/.test(line) ? [line] : line.split(/ (?=[>+] )/)
    )
    .join("\n");
}

// Genre tag: English, first letter capitalized (iTunes already gives "Rock",
// "K-Pop", "R&B/Soul" — this just guarantees the leading cap). iTunes splits a
// few genres out as siblings of Rock even though they're really Rock subgenres —
// fold those back in so the tag reads as the parent genre.
const GENRE_ALIAS = { alternative: "Rock", "alternative rock": "Rock", "indie rock": "Rock" };
const capGenre = (g) => {
  const t = (g || "").trim();
  return GENRE_ALIAS[t.toLowerCase()] || t.replace(/^./, (c) => c.toUpperCase());
};

// Country = artist nationality, NOT lyric language — an English-singing K-pop
// group is still 한국 (뉴진스 must never read as 영미). Deterministic signals
// first (store genre, name script); Gemini, which knows the artist, can
// override; the lyric language is only the last resort.
const COUNTRY_TAGS = ["한국", "일본", "영미", "기타"];
function countryOf({ artist, genre, lang }) {
  const g = (genre || "").toLowerCase();
  if (g.includes("k-pop")) return "한국";
  if (g.includes("j-pop") || g.includes("enka") || g.includes("anime")) return "일본";
  if (/[가-힣]/.test(artist || "")) return "한국";
  if (/[぀-ヿ㐀-鿿]/.test(artist || "")) return "일본";
  return { ko: "한국", ja: "일본", en: "영미" }[lang] || "기타";
}

// Shared by the add flow (`autotag`) and the backfill tool.
// Tags are country · genre · year only — no mood tags.
async function computeAuto({ title, artist, lyrics, lang, year, genre }) {
  let country = countryOf({ artist, genre, lang }); // deterministic baseline
  let titleKo = lang === "ko" ? title : "";
  let artistKo = "";
  let comment = "";

  // one combined Gemini call (avoids free-tier rate limits from many calls)
  const key = process.env.GEMINI_API_KEY;
  if (key && lyrics) {
    try {
      const raw = await geminiText(
        key,
        `노래 "${title}" (${artist})에 대해 아래 스키마의 JSON으로 답해줘.
- country: 아티스트의 국적 기준 분류 — "한국"|"일본"|"영미"|"기타" 중 하나. 가수의 출신·주 활동권 기준이며 가사 언어와 무관 (예: 뉴진스는 영어 가사여도 한국)
- titleKo: 곡 제목의 한국어 표기(영어·고유명사는 한글 음역, 뜻있는 제목은 번역)
- artistKo: 아티스트명이 일본어/한자면 한글 독음, 그 외에는 빈 문자열
- comment: 가사의 의미와 이 곡에 얽힌 실제 배경·일화를 녹인 개인 감상 1~2문장. 반드시 평서문 '~다'체(예: ~한다, ~이다, ~같다, ~된다)로 끝맺을 것. "~습니다/~합니다/~해요/~함/~음" 금지. 담백한 톤
가사:
${lyrics.slice(0, 2000)}`,
        true
      );
      const json = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
      if (COUNTRY_TAGS.includes(json.country)) country = json.country;
      if (!titleKo && json.titleKo) titleKo = String(json.titleKo).trim();
      if (json.artistKo) artistKo = String(json.artistKo).trim();
      if (json.comment) comment = String(json.comment).replace(/\s*\n+\s*/g, " ").trim();
    } catch {} // Gemini 실패해도 국가·장르·연도 태그는 유지
  }

  const tags = [country];
  // a Korean act released through the JP store carries a "J-Pop" store genre
  // (and vice versa) — realign the region-genre with the artist's country
  let genreTag = genre ? capGenre(genre) : "";
  if (country === "한국" && genreTag === "J-Pop") genreTag = "K-Pop";
  if (country === "일본" && genreTag === "K-Pop") genreTag = "J-Pop";
  if (genreTag) tags.push(genreTag);
  if (year) tags.push(String(year)); // exact release year, not the decade
  return { tags, titleKo, artistKo, comment };
}

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const fmValue = (fm, key) => (fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1] || "").trim();
const isBlank = (v) => !v || v === "[]";

// Replace `key: …` in place, or insert it right after `after:` when absent.
function setField(raw, key, value, after) {
  const line = `${key}: ${value}`;
  const existing = new RegExp(`^${key}:[ \\t]*.*$`, "m");
  if (existing.test(raw)) return raw.replace(existing, line);
  const anchor = new RegExp(`^(${after}:[ \\t]*.*)$`, "m");
  return anchor.test(raw) ? raw.replace(anchor, `$1\n${line}`) : raw;
}

// The body interleaves translation (`>`), reading (`+`) and note (`//`) lines —
// strip them so Gemini reads the original lyric, not our annotations.
const originalLyrics = (body) =>
  body
    .split("\n")
    .filter((l) => !/^\s*(>|\+|\/\/)/.test(l))
    .join("\n")
    .trim();

// ── lyrics lookup (lrclib) ────────────────────────────────────────────────
// iTunes' US store hands back romanized/translated titles ("Through the Night"
// for 밤편지, "Akuro No Oka" for アクロの丘) while lrclib is indexed under the
// native title. Measured hit rate jumped 12/16 → 15/16 by trying the native
// name too. A ±15s duration bound keeps a wrong-length track's lyrics out.
const LRC = "https://lrclib.net/api";
const DUR_BOUND = 15; // seconds
const hasCJK = (s) => /[぀-ヿ㐀-鿿가-힣]/.test(s || "");
// Per-fetch timeout so one slow/hung lrclib response can't stall the whole
// request (this is what pushed a single song past the serverless limit).
// One retry on a network error or 5xx — a transient blip must not read as "no
// lyrics". A 429 is NOT retried: hammering a rate limit just burns the budget.
async function getJson(url, timeoutMs = 4000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) return await r.json();
      if (r.status < 500) return null; // 404/429 etc. — not worth a retry
    } catch {
      // network error / timeout → retry once
    }
    if (attempt === 0) await new Promise((res) => setTimeout(res, 300));
  }
  return null;
}

const lrcCleanTitle = (t) =>
  (t || "")
    .replace(
      /\s*[\(\[][^)\]]*(remaster|live|acoustic|version|edit|mix|instrumental|deluxe|mono|stereo|feat|with|explicit|bonus)[^)\]]*[\)\]]/gi,
      ""
    )
    .replace(/\s*-\s*(single|ep|remaster(ed)?( \d{4})?|live|radio edit|.*version).*$/i, "")
    .replace(/\s*(feat\.?|ft\.?)\s+.*$/i, "")
    .trim();
const lrcCleanArtist = (a) => (a || "").split(/\s*[,&×]\s*|\s+(?:feat\.?|with|and the)\s+/i)[0].trim();

// Same track id in the JP/KR store often carries the native title/artist.
async function nativeMeta(trackId, left = () => 8000) {
  if (!trackId) return null;
  for (const country of ["JP", "KR"]) {
    if (left() <= 0) break;
    const j = await getJson(
      `https://itunes.apple.com/lookup?${new URLSearchParams({ id: trackId, country })}`,
      Math.min(4000, left())
    );
    const r = j?.results?.[0];
    if (r && hasCJK(`${r.trackName}${r.artistName}`))
      return { title: r.trackName, artist: r.artistName };
  }
  return null;
}

function nameCandidates(picked, native) {
  const out = [];
  const push = (t, a) => t && a && out.push({ t, a });
  push(picked.title, picked.artist);
  push(lrcCleanTitle(picked.title), lrcCleanArtist(picked.artist));
  if (native) {
    push(native.title, native.artist);
    push(lrcCleanTitle(native.title), lrcCleanArtist(native.artist));
  }
  const seen = new Set();
  return out.filter(({ t, a }) => {
    const k = `${t}|${a}`.toLowerCase();
    return seen.has(k) ? false : seen.add(k);
  });
}

const withinBound = (rowDur, want) => !want || !rowDur || Math.abs(rowDur - want) <= DUR_BOUND;

const asLyric = (text, native) => ({
  lyrics: text,
  lines: text.split("\n").filter((l) => l.trim()).length,
  native,
});

// Returns { lyrics, lines, native } or null. Stops at the first bounded hit, and
// abandons remaining candidates once the time budget is spent — so a slow lrclib
// can't push the request past the serverless timeout. deadlineMs bounds the whole
// lookup (default generous for the add flow; requality passes a tighter one).
async function findLyrics({ title, artist, album, duration, trackId }, deadlineMs = 20000) {
  const until = Date.now() + deadlineMs;
  const left = () => until - Date.now();
  const native =
    hasCJK(`${title}${artist}`) || left() <= 0 ? null : await nativeMeta(trackId, left);
  // omit falsy fields — URLSearchParams stringifies undefined to the literal
  // "undefined", which corrupts lrclib's exact /get match for pre-change songs.
  const qs = (o) =>
    new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "")).toString();
  for (const { t, a } of nameCandidates({ title, artist }, native)) {
    if (left() <= 0) break; // budget spent — stop rather than risk a timeout
    const g = await getJson(
      `${LRC}/get?${qs({ artist_name: a, track_name: t, album_name: album, duration })}`,
      Math.min(4000, left())
    );
    if (g?.plainLyrics?.trim() && withinBound(g.duration, duration))
      return asLyric(g.plainLyrics.trim(), native);
    if (left() <= 0) break;
    const list =
      (await getJson(`${LRC}/search?${qs({ track_name: t, artist_name: a })}`, Math.min(4000, left()))) ||
      [];
    const best = list
      .filter((r) => r.plainLyrics?.trim())
      .map((r) => ({ r, d: Math.abs((r.duration || 0) - (duration || 0)) }))
      .sort((x, y) => x.d - y.d)
      .find((x) => withinBound(x.r.duration, duration));
    if (best) return asLyric(best.r.plainLyrics.trim(), native);
  }
  return null;
}

// Auth is enforced by middleware.js (password cookie). Writes go through
// lib/store — fs locally, GitHub commits on Vercel.
export async function POST(req) {
  try {
    return await handle(req);
  } catch (e) {
    // always return JSON so the client never hits an empty-body parse error
    return Response.json({ error: e.message || "서버 오류" }, { status: 500 });
  }
}

async function handle(req) {
  const { action, ...body } = await req.json();

  if (action === "search") {
    const PAGE = 50; // per store — Apple caps at 200; 50 keeps latency sane and triples visible depth vs 25
    const offset = body.offset || 0;
    // free-text search across title and artist — iTunes matches both by default
    // search US/KR/JP stores together — each store has a different catalog
    const stores = await Promise.all(
      ["US", "KR", "JP"].map((c) =>
        fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(body.query)}&entity=song&limit=${PAGE}&offset=${offset}&country=${c}`
        )
          .then((r) => r.json())
          .then((r) => r.results || [])
          .catch(() => [])
      )
    );
    // Normalize before matching — iTunes decorates names with (feat. …), curly
    // quotes, brackets and hyphens that make honest matches miss.
    const norm = (s) =>
      (s || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[’'ʻ´`"]/g, "")
        .replace(/[()\[\]\-_.,!?~×&/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    // relevance: query matches in title and artist float to the top
    const q = norm(body.query);
    const words = q.split(" ").filter(Boolean);
    const score = (r) => {
      const t = norm(r.trackName);
      const a = norm(r.artistName);
      let s = 0;
      // tiers are exclusive — an exact title must not also collect startsWith+includes,
      // or a song *named* "radiohead" outranks the band Radiohead.
      if (a === q) s += 120; // a bare band name is almost always an artist search
      else if (a.startsWith(q)) s += 50;
      else if (a.includes(q)) s += 25;
      if (t === q) s += 100;
      else if (t.startsWith(q)) s += 40;
      else if (t.includes(q)) s += 30;
      let hits = 0;
      for (const w of words) {
        const inT = t.includes(w);
        const inA = a.includes(w);
        if (inT) s += 10;
        if (inA) s += 12;
        if (inT || inA) hits++;
      }
      // "artist + part of the title" is the common query — every word landing
      // somewhere (artist or title) is the strongest relevance signal there is
      if (words.length > 1 && hits === words.length) s += 80;
      // demote covers/karaoke — the original should win
      if (
        /cover|karaoke|instrumental|tribute|music box|orgel|オルゴール|カラオケ|原曲|歌ってみた|acapella/.test(
          `${t} ${a}`
        )
      )
        s -= 60;
      return s;
    };
    // interleave stores so same-score results from KR/JP aren't buried under US
    const interleaved = [];
    for (let i = 0; i < PAGE; i++)
      for (const s of stores) if (s[i]) interleaved.push(s[i]);
    const seen = new Set();
    const results = [];
    for (const r of interleaved.sort((x, y) => score(y) - score(x))) {
      const key = `${r.trackName}|${r.artistName}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const art = r.artworkUrl100 || ""; // some tracks/regions omit artwork
      results.push({
        trackId: r.trackId, // lets the lyrics step re-query the JP/KR store for native names
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName,
        artwork: art.replace("100x100", "600x600"),
        thumb: art,
        duration: Math.round((r.trackTimeMillis || 0) / 1000),
        year: (r.releaseDate || "").slice(0, 4),
        genre: r.primaryGenreName || "",
        preview: r.previewUrl || "",
      });
    }
    return Response.json({
      results,
      hasMore: stores.some((s) => s.length === PAGE),
      nextOffset: offset + PAGE,
    });
  }

  if (action === "lyrics") {
    const found = await findLyrics(body);
    if (found) return Response.json({ lyrics: found.lyrics });

    // #3 — not on lrclib: hand back native-name search links so the user can
    // grab the lyrics from the source and paste them, instead of a dead end.
    const native = hasCJK(`${body.title}${body.artist}`)
      ? null
      : await nativeMeta(body.trackId);
    const t = native?.title || body.title;
    const a = native?.artist || body.artist;
    const q = encodeURIComponent(`${t} ${a} 가사`);
    return Response.json({
      lyrics: null,
      searchLinks: [
        { label: "Google", url: `https://www.google.com/search?q=${q}` },
        {
          label: "lrclib",
          url: `https://lrclib.net/search/${encodeURIComponent(`${t} ${a}`)}`,
        },
      ],
    });
  }

  // #5 — a stored song may hold a partial transcription (iTunes' romanized name
  // yields a shorter one). Scanning all songs in one request overruns the
  // serverless timeout (FUNCTION_INVOCATION_TIMEOUT), so it's split: the client
  // gets the roster instantly, then checks one song per request.
  if (action === "requalityList") {
    return Response.json({
      songs: getAllSongs().map((s) => ({ slug: s.slug, title: s.title, artist: s.artist })),
    });
  }

  if (action === "requalityOne") {
    const s = getAllSongs().find((x) => x.slug === body.slug);
    if (!s) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const have = s.stanzas.reduce((n, st) => n + st.lines.filter((l) => l.en?.trim()).length, 0);
    const found = await findLyrics(
      { title: s.title, artist: s.artist, album: s.album, duration: s.duration, trackId: s.trackId },
      15000 // budget per song so a rescan stays snappy
    );
    // only surface a meaningfully fuller version (guards transcription noise)
    const fuller = found && found.lines >= have + 5;
    return Response.json({ have, found: fuller ? found.lines : null });
  }

  if (action === "translate") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const text = await translateLyrics(key, body);
    if (!text) return Response.json({ error: "Gemini 응답이 비었습니다" }, { status: 502 });
    return Response.json({ text });
  }

  if (action === "autotag") {
    return Response.json(await computeAuto(body));
  }

  // Which songs are missing generated metadata. `artist_ko` only counts as
  // missing for kanji/kana artists — a latin name has no reading to give.
  if (action === "audit") {
    const list = getAllSongs()
      .map((s) => {
        const missing = [];
        if (!s.tags?.length) missing.push("tags");
        if (!s.comment) missing.push("comment");
        if (!s.title_ko) missing.push("title_ko");
        if (needsReading(s.artist) && !s.artist_ko) missing.push("artist_ko");
        return { slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork, missing };
      })
      .filter((s) => s.missing.length);
    return Response.json({ list });
  }

  // Fill only the blank fields of one song, leaving everything else untouched.
  // ponytail: one commit (and one Vercel rebuild) per song. Fine for a few songs;
  // batch through the git trees API if this ever runs over dozens.
  if (action === "backfill") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;

    const artist = fmValue(fm, "artist");
    const auto = await computeAuto({
      title: fmValue(fm, "title"),
      artist,
      lyrics: originalLyrics(bodyText),
      lang: fmValue(fm, "lang") || "en",
      year: fmValue(fm, "year"),
      genre: fmValue(fm, "genre"), // stored on save; empty for pre-change songs
    });

    let out = raw;
    const filled = [];
    if (isBlank(fmValue(fm, "tags")) && auto.tags.length) {
      out = setField(out, "tags", `[${auto.tags.join(", ")}]`, "year");
      filled.push("tags");
    }
    if (isBlank(fmValue(fm, "comment")) && auto.comment) {
      out = setField(out, "comment", auto.comment, "date");
      filled.push("comment");
    }
    if (isBlank(fmValue(fm, "title_ko")) && auto.titleKo) {
      out = setField(out, "title_ko", auto.titleKo, "title");
      filled.push("title_ko");
    }
    if (needsReading(artist) && isBlank(fmValue(fm, "artist_ko")) && auto.artistKo) {
      out = setField(out, "artist_ko", auto.artistKo, "artist");
      filled.push("artist_ko");
    }

    if (!filled.length) return Response.json({ filled: [] });
    await writeSong(body.slug, out, `chore(song): backfill ${filled.join(",")} — ${body.slug}`);
    return Response.json({ filled });
  }

  // Regenerate ALL AI metadata (tags·comment·title_ko·artist_ko) for one song,
  // OVERWRITING existing values. Lyrics and non-AI fields (album/year/artwork…)
  // are untouched. Driven one song per request from the client (timeout-safe).
  if (action === "regenMeta") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const artist = fmValue(fm, "artist");
    const lang = fmValue(fm, "lang") || "en";
    const auto = await computeAuto({
      title: fmValue(fm, "title"),
      artist,
      lyrics: originalLyrics(bodyText),
      lang,
      year: fmValue(fm, "year"),
      genre: fmValue(fm, "genre"),
    });
    let out = raw;
    const updated = [];
    // tags = country · genre · year only (deterministic). Overwrite fully so any
    // legacy mood tags are dropped and the year migrates from decade to exact.
    if (auto.tags.length) {
      out = setField(out, "tags", `[${auto.tags.join(", ")}]`, "year");
      updated.push("tags");
    }
    if (auto.comment) {
      out = setField(out, "comment", auto.comment, "date");
      updated.push("comment");
    }
    // title_ko: for ko songs computeAuto returns the title itself — skip that no-op
    if (auto.titleKo && auto.titleKo !== fmValue(fm, "title")) {
      out = setField(out, "title_ko", auto.titleKo, "title");
      updated.push("title_ko");
    }
    if (needsReading(artist) && auto.artistKo) {
      out = setField(out, "artist_ko", auto.artistKo, "artist");
      updated.push("artist_ko");
    }
    if (!updated.length) return Response.json({ updated: [] });
    await writeSong(body.slug, out, `chore(song): regen metadata — ${body.slug}`);
    return Response.json({ updated });
  }

  // Regenerate ONLY the comment ('~다'체), leaving lyrics and other fields intact.
  if (action === "regenComment") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const comment = (
      await geminiText(key, commentPrompt(fmValue(fm, "title"), fmValue(fm, "artist"), originalLyrics(bodyText)))
    )
      .replace(/\s*\n+\s*/g, " ")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (!comment) return Response.json({ error: "코멘트 생성 실패" }, { status: 502 });
    await writeSong(body.slug, setField(raw, "comment", comment, "date"), `chore(song): regen comment — ${body.slug}`);
    return Response.json({ comment });
  }

  // Add the "> " translation line to each lyric line — used to give a Korean song
  // the same two-line layout as EN/JA songs. Only runs when translation is absent,
  // so it never clobbers a song's existing (hand-edited) translation.
  if (action === "addTranslation") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    if (/^\s*>/m.test(bodyText))
      return Response.json({ error: "이미 번역이 있는 곡입니다" }, { status: 409 });
    const lang = fmValue(fm, "lang") || "ko";
    const translated = await translateLyrics(key, {
      title: fmValue(fm, "title"),
      artist: fmValue(fm, "artist"),
      lang,
      lyrics: originalLyrics(bodyText),
    });
    if (!translated) return Response.json({ error: "번역 생성 실패" }, { status: 502 });
    await writeSong(
      body.slug,
      `---\n${fm}\n---\n${translated.trim()}\n`,
      `chore(song): add translation — ${body.slug}`
    );
    return Response.json({ ok: true });
  }

  if (action === "load") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    return Response.json({ raw: song.raw });
  }

  if (action === "update") {
    if (!(await readSong(body.slug)))
      return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    await writeSong(body.slug, body.raw, `edit(song): ${body.slug}`);
    return Response.json({ ok: true });
  }

  if (action === "delete") {
    await deleteSong(body.slug);
    return Response.json({ ok: true });
  }

  if (action === "save") {
    const { title, titleKo, artist, artistKo, album, year, artwork, lang, tags, comment, lyrics, preview, trackId, duration, genre } = body;
    const slug = `${artist} ${title}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
      .replace(/^-|-$/g, "");
    const md = `---
title: ${title}
title_ko: ${titleKo || title}
artist: ${artist}
artist_ko: ${artistKo || ""}
album: ${album || ""}
year: ${year || ""}
genre: ${genre || ""}
artwork: ${artwork || ""}
preview: ${preview || ""}
trackId: ${trackId || ""}
duration: ${duration || ""}
lang: ${lang}
tags: [${(tags || "").split(",").map((t) => t.trim()).filter(Boolean).join(", ")}]
date: ${new Date().toISOString().slice(0, 10)}
comment: ${(comment || "").replace(/\s*\n+\s*/g, " ")}
---
${lyrics.trim()}
`;
    await writeSong(slug, md, `add(song): ${slug}`);
    return Response.json({ slug });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
