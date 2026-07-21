import { readSong, writeSong, deleteSong, readMovie, writeMovie, deleteMovie } from "../../../lib/store";
import { getAllSongs, capitalizeLyricLines } from "../../../lib/songs";
import { GENRES, capGenre, COUNTRY_TAGS, genreTagOf, genreIssue } from "../../../lib/genre";
import { EMOTIONS, parseEmotion, parseKeywords } from "../../../lib/keywords";
import { searchMovies, movieDetail } from "../../../lib/tmdb";

// per-request work is one song's lyric lookup (native chain hits iTunes+lrclib
// a few times); 30s is ample and stays within hobby-plan limits.
export const maxDuration = 30;

async function geminiText(key, prompt, json = false) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  });
  // Gemini free tier throws intermittent 503 "high demand" and 429 rate-limit
  // (RPM/RPD) spikes — retry with backoff so a single blip doesn't fail a
  // comment/translation. 429 gets a longer wait (rate windows are seconds, not
  // ms) but stays well under maxDuration; a persistent 429 still gives up so a
  // bulk run doesn't stall on an exhausted daily quota.
  for (let attempt = 0; attempt < 3; attempt++) {
    let rateLimited = false;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } else if (res.status === 429) {
        rateLimited = true;
      } else if (res.status < 500) {
        return ""; // 400/401 etc. — a retry won't help
      }
    } catch {}
    if (attempt < 2) await new Promise((r) => setTimeout(r, (rateLimited ? 5000 : 800) * (attempt + 1)));
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
  // capitalize here too, not just on save, so the reviewer sees the final text
  // in the edit box instead of a surprise change after publishing
  return capitalizeLyricLines(normalizeInterleaved(await geminiText(key, prompt)));
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

// Re-stanza a lyric body by musical structure — sources disagree wildly on blank
// lines (lrclib often has none, or one per line), so the layout standard is the
// song's structure. Gemini decides only WHERE to break (contiguous group sizes +
// section label); the lyric lines, with their >/+/// companions, move untouched.
// Returns the reorganized body, or null when it can't/shouldn't run (no key, too
// short, or a response that doesn't match the lyrics). Shared by the restanza
// action and the save flow (auto-restanza on publish).
async function restanzaBody({ title, artist, bodyText, key }) {
  if (!key) return null;
  // unit = one original line plus the annotation lines glued under it
  const units = [];
  for (const line of bodyText.split("\n")) {
    if (!line.trim() || /^\[.*\]$/.test(line.trim())) continue; // old breaks/headers die here
    if (/^\s*(>|\+|\/\/)/.test(line) && units.length) units[units.length - 1].push(line);
    else units.push([line]);
  }
  if (units.length < 4) return null; // too short to be worth reorganizing

  const numbered = units.map((u, i) => `${i + 1}. ${u[0]}`).join("\n");
  const rawJson = await geminiText(
    key,
    `아래는 노래 "${title}" (${artist}) 가사의 원문 줄 목록이다 (총 ${units.length}줄).
곡의 음악적 구조(verse/chorus/bridge 등)에 따라 앞에서부터 연속된 덩어리로 나눠라.
JSON 배열로만 답하라: [{"label":"Verse 1","count":4}, ...]
- count: 그 연에 속하는 줄 수. 모든 count의 합은 반드시 ${units.length}.
- label: "Intro","Verse 1","Pre-Chorus","Chorus","Bridge","Outro","Interlude" 형식. 구조가 불분명한 연은 null.
- 한 연은 보통 2~8줄. 줄 순서 변경·삭제·추가 금지.
${numbered}`,
    true
  );
  let groups;
  try {
    groups = JSON.parse(rawJson.replace(/^```json\s*|\s*```$/g, "").trim());
  } catch {
    return null;
  }
  const counts = (Array.isArray(groups) ? groups : []).map((g) => Math.floor(g?.count) || 0);
  if (counts.reduce((a, b) => a + b, 0) !== units.length || counts.some((c) => c < 1))
    return null; // structure doesn't match the lyrics — leave the body as-is

  let i = 0;
  const out = groups.map((g, gi) => {
    const label =
      typeof g.label === "string" && /^[\w\s-]{2,20}$/.test(g.label.trim())
        ? `[${g.label.trim()}]\n`
        : "";
    return label + units.slice(i, (i += counts[gi])).flat().join("\n");
  });
  return out.join("\n\n");
}

// Stanza notes (`//`) are hand-written analysis — the one part of a song body
// that can't be regenerated. Replacing the body would delete them silently, so
// re-anchor each note to the original lyric line that opened its stanza. A
// replacement transcription is a superset of the old one, so that line almost
// always survives; parseLyrics folds every `//` in a stanza into one note, so
// dropping it right under the anchor puts it in the right stanza no matter
// where the new stanza breaks fall. Returns { body, kept, lost }.
export function carryNotes(oldBody, newBody) {
  const notes = [];
  let anchor = null;
  for (const line of oldBody.split("\n")) {
    const t = line.trim();
    if (!t || /^\[.*\]$/.test(t)) {
      anchor = null; // stanza break or header — next original line is the anchor
      continue;
    }
    if (/^\/\//.test(t)) {
      if (anchor) notes.push([anchor, t]);
      continue;
    }
    if (/^[>+]/.test(t)) continue; // annotation, never an anchor
    anchor ??= t;
  }
  if (!notes.length) return { body: newBody, kept: 0, lost: 0 };

  const out = newBody.split("\n");
  let kept = 0;
  for (const [anchorText, note] of notes) {
    // a repeated chorus line can anchor to the wrong stanza; misplacing a note
    // still beats deleting it
    const at = out.findIndex((l) => l.trim() === anchorText);
    if (at < 0) continue;
    // slide past the anchor's own `>`/`+` companions — a note wedged between a
    // lyric line and its translation still parses, but reads as a mistake when
    // the markdown is edited by hand
    let to = at + 1;
    while (to < out.length && /^\s*[>+]/.test(out[to])) to++;
    out.splice(to, 0, note);
    kept++;
  }
  return { body: out.join("\n"), kept, lost: notes.length - kept };
}

// Genre vocabulary, capGenre, KO_GENRE, COUNTRY_TAGS, genreTagOf, genreIssue all
// live in lib/genre.js (shared with the lint tool + unit-tested there).

// Country = artist nationality, NOT lyric language — an English-singing K-pop
// group is still 한국 (뉴진스 must never read as 영미). Deterministic signals
// first (store genre, name script); Gemini, which knows the artist, can
// override; the lyric language is only the last resort.
function countryOf({ artist, genre, lang }) {
  const g = (genre || "").toLowerCase();
  if (g.includes("k-pop")) return "한국";
  if (g.includes("j-pop") || g.includes("j-rock") || g.includes("enka") || g.includes("anime")) return "일본";
  if (/[가-힣]/.test(artist || "")) return "한국";
  if (/[぀-ヿ㐀-鿿]/.test(artist || "")) return "일본";
  return { ko: "한국", ja: "일본", en: "영미" }[lang] || "기타";
}

// Shared by the add flow (`autotag`) and the backfill tool.
// Tags are country · genre · year only — no mood tags.
async function computeAuto({ title, artist, lyrics, lang, year, genre }) {
  let country = countryOf({ artist, genre, lang }); // deterministic baseline
  let genreTag = genre ? capGenre(genre) : ""; // store genre — the fallback
  let titleKo = lang === "ko" ? title : "";
  let artistKo = "";
  let comment = "";
  let keywords = []; // 번역 가사의 핵심 단어 3~5개
  let emotion = ""; // 닫힌 목록의 감정 한 단어 — 통계 일기가 날짜별로 집계
  let aiOk = false; // did the Gemini call actually return usable fields?

  // one combined Gemini call (avoids free-tier rate limits from many calls)
  const key = process.env.GEMINI_API_KEY;
  if (key && lyrics) {
    try {
      const raw = await geminiText(
        key,
        `노래 "${title}" (${artist})에 대해 아래 스키마의 JSON으로 답해줘.
- country: 아티스트의 국적 기준 분류 — "한국"|"일본"|"영미"|"기타" 중 하나. 가수의 출신·주 활동권 기준이며 가사 언어와 무관 (예: 뉴진스는 영어 가사여도 한국)
- genre: 이 곡의 세부 장르를 아래 목록에서 정확히 하나만 골라라. 가능한 한 구체적으로 — 록이면 "Rock"보다 "Hard Rock"/"Alternative Rock"/"Indie Rock" 등 하위 장르를 고른다. "K-Pop"/"J-Pop"은 아이돌·주류 아이돌팝 아티스트에 한정하고, 밴드·록/메탈/인디·싱어송라이터는 아이돌이어도 실제 사운드의 록/메탈/인디/포크 하위장르로 분류한다(예: 시나위→Heavy Metal, 장기하→Indie Rock, GLAY·Dir en grey→J-Rock). 목록: ${GENRES.join(", ")}${genre ? `\n  (참고: 음원사 분류는 "${genre}"지만 부정확할 수 있다 — 음원사는 한국 록/메탈 밴드도 K-Pop으로 뭉뚱그린다. 곡의 실제 사운드를 우선하라)` : ""}
- titleKo: 곡 제목의 한국어 표기(영어·고유명사는 한글 음역, 뜻있는 제목은 번역)
- artistKo: 아티스트명이 일본어/한자면 한글 독음, 그 외에는 빈 문자열
- comment: 가사의 의미와 이 곡에 얽힌 실제 배경·일화를 녹인 개인 감상 1~2문장. 반드시 평서문 '~다'체(예: ~한다, ~이다, ~같다, ~된다)로 끝맺을 것. "~습니다/~합니다/~해요/~함/~음" 금지. 담백한 톤
- keywords: 한국어 번역 가사에서 자주 등장하거나 주제를 관통하는 핵심 단어 3~5개의 배열. 반드시 번역문에 실제로 나오는 단어(명사 위주, 1~6자)만. 문장·구절 금지
- emotion: 이 곡의 감정을 아래 목록에서 정확히 하나만. 목록: ${EMOTIONS.join(", ")}
가사:
${lyrics.slice(0, 2000)}`,
        true
      );
      const json = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
      aiOk = true; // parsed a response — the tags below are AI-informed, not fallback
      if (COUNTRY_TAGS.includes(json.country)) country = json.country;
      const g = capGenre(json.genre); // maps Korean/casing onto the vocabulary
      if (GENRES.includes(g)) genreTag = g; // only a vocabulary term wins over the store genre
      if (!titleKo && json.titleKo) titleKo = String(json.titleKo).trim();
      if (json.artistKo) artistKo = String(json.artistKo).trim();
      if (json.comment) comment = String(json.comment).replace(/\s*\n+\s*/g, " ").trim();
      // both optional — a song without them just renders without them
      keywords = parseKeywords(json.keywords);
      emotion = parseEmotion(json.emotion);
    } catch {} // Gemini 실패해도 국가·장르·연도 태그는 유지
  }

  const tags = [country];
  // a Korean act released through the JP store carries a "J-Pop" store genre
  // (and vice versa) — realign the region-genre with the artist's country
  if (country === "한국" && genreTag === "J-Pop") genreTag = "K-Pop";
  if (country === "일본" && genreTag === "K-Pop") genreTag = "J-Pop";
  if (genreTag) tags.push(genreTag);
  if (year) tags.push(String(year)); // exact release year, not the decade
  return { tags, titleKo, artistKo, comment, keywords, emotion, aiOk };
}

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const fmValue = (fm, key) => (fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1] || "").trim();
const isBlank = (v) => !v || v === "[]";
const parseTags = (value = "") =>
  value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

// Replace `key: …` in place, or insert it right after `after:` when absent.
function setField(raw, key, value, after) {
  const line = `${key}: ${value}`;
  const existing = new RegExp(`^${key}:[ \\t]*.*$`, "m");
  if (existing.test(raw)) return raw.replace(existing, line);
  const anchor = new RegExp(`^(${after}:[ \\t]*.*)$`, "m");
  return anchor.test(raw) ? raw.replace(anchor, `$1\n${line}`) : raw;
}

function ratingGuide(rating) {
  const ratingNum = Number(rating);
  return Number.isFinite(ratingNum) && ratingNum >= 3
    ? `사용자 별점은 ${ratingNum.toFixed(1)}/5다. 작품의 기존 평가와 반응을 참고하되, 코멘트는 좋은 점·강점·인상적인 성취를 중심으로 쓸 것.`
    : Number.isFinite(ratingNum) && ratingNum > 0 && ratingNum <= 2.5
      ? `사용자 별점은 ${ratingNum.toFixed(1)}/5다. 작품의 기존 평가와 반응을 참고하되, 코멘트는 아쉬운 점·한계·비판받는 지점을 중심으로 쓸 것.`
      : "사용자 별점은 아직 없다. 작품의 기존 평가와 반응을 참고하되, 장단점을 과장 없이 균형 있게 쓸 것.";
}

async function movieComment({ key, title, director, mediaType, rating, synopsis = "", tmdbRating = "", tmdbVotes = "" }) {
  const kind = mediaType === "tv" ? "드라마" : "영화";
  const publicRating =
    tmdbRating && Number(tmdbVotes) > 0
      ? `TMDB 공개 평점은 ${Number(tmdbRating).toFixed(1)}/10 (${tmdbVotes}표)다.`
      : "";
  const synopsisHint = synopsis ? `\n줄거리 참고:\n${synopsis.slice(0, 800)}` : "";
  return (
    await geminiText(
      key,
      `${kind} "${title}"${director ? ` (연출/감독 ${director})` : ""}에 대한 개인 감상 코멘트를 한국어 1~2문장으로 써줘. ${publicRating} ${ratingGuide(rating)} 작품의 주제·연출·인상을 담아서. 반드시 평서문 '~다'체로 끝맺을 것. "~습니다/~해요" 금지. 담백한 톤. 코멘트 문장만 출력.${synopsisHint}`
    )
  )
    .replace(/\s*\n+\s*/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim();
}

// The body interleaves translation (`>`), reading (`+`) and note (`//`) lines —
// strip them so Gemini reads the original lyric, not our annotations.
const originalLyrics = (body) =>
  body
    .split("\n")
    .filter((l) => !/^\s*(>|\+|\/\/)/.test(l))
    .join("\n")
    .trim();

// How many lines of actual lyric a body holds — annotations, blank lines and
// section headers excluded. This must match what parseLyrics counts as a line
// (headers become stanza.section, never stanza.lines), because the rescan
// measures a stored song that way. Counting headers here instead would make the
// replace guard stricter than the scan by one per header and reject a swap the
// scan had just offered. Shared by both so the two can't drift apart.
export const lyricLineCount = (text) =>
  (text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(>|\+|\/\/)/.test(l) && !/^\[.*\]$/.test(l)).length;

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

// Pull an artist's full catalog by lookup — reaches 19금/explicit tracks that
// Apple drops from /search but keeps in the catalog. Resolve the artist id(s)
// (dropping trailing title words until one resolves), then look them up. Bounded
// (≤3 artists) and parallel so it can run inline on every search cheaply.
// Shared text normalizer (decoration-insensitive) for matching names/titles.
const normText = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’'ʻ´`"]/g, "")
    .replace(/[()\[\]\-_.,!?~×&/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchArtistCatalog(query) {
  const words = (query || "").trim().split(/\s+/).filter(Boolean);
  // the artist is the leading OR trailing tokens (users type both "가수 곡" and
  // "곡 가수") — try the full query, the first two, and the last two words. All
  // resolutions run in parallel (one round trip), not a sequential trim loop.
  const terms = [...new Set([words.join(" "), words.slice(0, 2).join(" "), words.slice(-2).join(" ")])].filter(Boolean);
  const artists = new Map(); // id -> name
  await Promise.all(
    terms.flatMap((term) =>
      ["KR", "US"].map((c) =>
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=musicArtist&limit=3&country=${c}`)
          .then((r) => r.json())
          .then((r) => (r.results || []).forEach((a) => a.artistId && artists.set(a.artistId, a.artistName || "")))
          .catch(() => {})
      )
    )
  );
  if (!artists.size) return [];
  // iTunes' musicArtist search is loose ("master muzik" also returns i-dle,
  // NewJeans) — keep only artists whose name actually appears in the query, so
  // an artist-only search doesn't drag in unrelated discographies.
  const nq = normText(query);
  let ids = [...artists.entries()].filter(([, name]) => name && nq.includes(normText(name))).map(([id]) => id);
  if (!ids.length) ids = [...artists.keys()].slice(0, 1); // no clean match → best single guess
  const lists = await Promise.all(
    ids.slice(0, 3).map((id) =>
      fetch(`https://itunes.apple.com/lookup?id=${id}&entity=song&limit=200&country=KR`)
        .then((r) => r.json())
        .then((j) => (j.results || []).filter((r) => r.wrapperType === "track"))
        .catch(() => [])
    )
  );
  return lists.flat();
}

// resolve to [] if a best-effort task overruns — used so the artist-catalog
// augmentation can never stall the main search
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((r) => setTimeout(() => r([]), ms))]);

// Shape an iTunes track (from /search or /lookup) into the picker's result form.
function itunesToResult(r) {
  const art = r.artworkUrl100 || ""; // some tracks/regions omit artwork
  return {
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
  };
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
    // Normal /search across stores + the artist catalog (for hidden 19금 tracks),
    // in parallel. Catalog runs only on the first page — its tracks are folded in
    // once, filtered to title matches below, so paging stays search-only.
    const [stores, catalog] = await Promise.all([
      Promise.all(
        ["US", "KR", "JP"].map((c) =>
          fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(body.query)}&entity=song&limit=${PAGE}&offset=${offset}&country=${c}`
          )
            .then((r) => r.json())
            .then((r) => r.results || [])
            .catch(() => [])
        )
      ),
      offset === 0 ? withTimeout(fetchArtistCatalog(body.query), 3500) : Promise.resolve([]),
    ]);
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
      // gentle recency tiebreaker (≤3 pts) — never overrides a relevance tier,
      // but among equally-matched tracks (e.g. an artist-only search's whole
      // catalog) the newest float up, so a recent hidden release isn't buried.
      const yr = +(r.releaseDate || "").slice(0, 4) || 0;
      if (yr) s += Math.min(3, Math.max(0, (yr - 2000) / 9));
      return s;
    };
    // One scoring pool: store tracks + catalog tracks the /search dropped
    // (19금/explicit). Query words already covered by the catalog's artist names
    // are the "artist" part; whatever's left is the "title" part. Artist-only
    // search ("Master Muzik") has no leftover title words → include the whole
    // catalog (its hidden tracks too). "Master Muzik 도련님" leaves 도련님 → keep
    // only catalog tracks whose title matches, so the discography doesn't flood.
    // Scoring both pools together ranks the all-words match (artist AND title) top.
    const catalogArtists = normText([...new Set(catalog.map((r) => r.artistName))].join(" "));
    const titleWords = words.filter((w) => w.length > 1 && !catalogArtists.includes(normText(w)));
    const seen = new Set();
    const pool = [];
    const add = (r) => {
      const key = `${r.trackName}|${r.artistName}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      pool.push(r);
    };
    for (let i = 0; i < PAGE; i++) for (const s of stores) if (s[i]) add(s[i]);
    for (const r of catalog)
      if (!titleWords.length || titleWords.some((w) => normText(r.trackName).includes(w))) add(r);
    const results = pool.sort((x, y) => score(y) - score(x)).map(itunesToResult);
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
    // measure the candidate the same way `have` was measured — lrclib bodies
    // sometimes carry [Verse 1] headers, which would otherwise pad the count
    const foundLines = found ? lyricLineCount(found.lyrics) : 0;
    // only surface a meaningfully fuller version (guards transcription noise)
    const fuller = found && foundLines >= have + 5;
    // hand the text back with the count so "교체" doesn't have to hit lrclib
    // again — the refetch plus two Gemini calls would overrun maxDuration.
    return Response.json({
      have,
      found: fuller ? foundLines : null,
      lyrics: fuller ? found.lyrics : undefined,
    });
  }

  // Replace a partial transcription with the fuller one found by the rescan, and
  // regenerate the translation for it. The old body is discarded, so the write
  // is deliberately the LAST thing here: if Gemini stalls and the request times
  // out, the song is left untouched rather than half-rewritten.
  if (action === "requalityApply") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, oldBody] = m;

    const fresh = (body.lyrics || "").trim();
    if (!fresh) return Response.json({ error: "교체할 가사가 비었습니다" }, { status: 400 });
    // Re-check the client's claim. A stale or buggy caller must never be able to
    // trade a full transcription for a shorter one.
    const had = lyricLineCount(oldBody);
    if (lyricLineCount(fresh) <= had)
      return Response.json(
        { error: `새 가사가 더 온전하지 않습니다 (현재 ${had}줄 → 새 가사 ${lyricLineCount(fresh)}줄)` },
        { status: 409 }
      );

    const translated = await translateLyrics(key, {
      title: fmValue(fm, "title"),
      artist: fmValue(fm, "artist"),
      lang: fmValue(fm, "lang") || "",
      lyrics: fresh,
    });
    if (!translated) return Response.json({ error: "번역 생성 실패" }, { status: 502 });

    let newBody = translated.trim();
    try {
      const restanza = await restanzaBody({
        title: fmValue(fm, "title"),
        artist: fmValue(fm, "artist"),
        bodyText: newBody,
        key,
      });
      if (restanza) newBody = restanza;
    } catch {} // layout is cosmetic — never lose the new lyrics over it
    const { body: withNotes, kept, lost } = carryNotes(oldBody, newBody);

    await writeSong(
      body.slug,
      `---\n${fm}\n---\n${withNotes.trim()}\n`,
      `chore(song): fuller transcription — ${body.slug}`
    );
    return Response.json({ lines: lyricLineCount(withNotes), notesKept: kept, notesLost: lost });
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

  // A reading is only owed to Japanese-DOMINANT lines — a Korean/English line
  // quoting a few kana words would get a nonsense duplicate reading.
  const isJaLine = (s) =>
    /[぀-ヿ]/.test(s) &&
    !/[가-힣]/.test(s) &&
    (s.match(/[぀-ヿ㐀-鿿]/g) || []).length >= (s.match(/[a-z]/gi) || []).length;

  // Format lint — catches the failure modes we've actually hit: original lines
  // whose translation is missing, Japanese lines without a reading, and Gemini's
  // inline ">"/"+" markers glued onto the lyric line (the supernatural bug).
  if (action === "lint") {
    const report = getAllSongs()
      .map((s) => {
        const lines = s.stanzas.flatMap((st) => st.lines);
        const translated = lines.filter((l) => l.ko?.trim()).length;
        // a Korean song with zero translations is a deliberate choice, not a defect
        const untranslated =
          s.lang === "ko" && translated === 0 ? 0 : lines.length - translated;
        const noReading = lines.filter((l) => isJaLine(l.en) && !l.reading?.trim()).length;
        const inline = lines.filter((l) => / [>+] /.test(l.en)).length;
        const issues = [];
        if (inline) issues.push(`인라인 마커 의심 ${inline}줄`);
        if (untranslated) issues.push(`번역 없음 ${untranslated}줄`);
        if (noReading) issues.push(`독음 없음 ${noReading}줄`);
        // genre sanity — flagged songs get a one-click 장르 재생성 in the UI
        const gIssue = genreIssue(genreTagOf(s.tags));
        if (gIssue) issues.push(`장르: ${gIssue}`);
        return { slug: s.slug, title: s.title, artist: s.artist, issues, genreFix: !!gIssue };
      })
      .filter((s) => s.issues.length);
    return Response.json({ report, total: getAllSongs().length });
  }

  // Auto-fix what lint found, one song per request (timeout-safe, one commit
  // per song). Inline markers are split mechanically; missing translations and
  // readings are generated ONLY for the lines that lack them — existing
  // (hand-edited) annotations are never touched.
  if (action === "lintFix") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw0 = song.raw.replace(/\r\n/g, "\n");
    const m = raw0.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const fixed = [];

    let fixedBody = normalizeInterleaved(bodyText);
    if (fixedBody !== bodyText) fixed.push("인라인 마커 분리");

    // a Korean song with no ">" lines at all chose "번역 없음" — respect that
    const lang = fmValue(fm, "lang") || "en";
    const skipTranslate = lang === "ko" && !/^\s*>/m.test(fixedBody);

    const lines = fixedBody.split("\n");
    const isOrig = (l) => {
      const t = l.trim();
      return (
        t &&
        !t.startsWith(">") &&
        !t.startsWith("+") &&
        !t.startsWith("//") &&
        !(t.startsWith("[") && t.endsWith("]"))
      );
    };
    const needs = []; // { i, text, wantReading, wantKo }
    for (let i = 0; i < lines.length; i++) {
      if (!isOrig(lines[i])) continue;
      let hasKo = false;
      let hasReading = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*>/.test(lines[j])) hasKo = true;
        else if (/^\s*\+/.test(lines[j])) hasReading = true;
        else break;
      }
      const text = lines[i].trim();
      const wantReading = isJaLine(text) && !hasReading;
      const wantKo = !hasKo && !skipTranslate;
      if (wantReading || wantKo) needs.push({ i, text, wantReading, wantKo });
    }

    // no Gemini key → still save the mechanical fixes, just skip generation
    const key = process.env.GEMINI_API_KEY;
    if (needs.length && !key) {
      fixed.push("번역·독음 생성 건너뜀 (GEMINI_API_KEY 없음)");
      needs.length = 0;
    }

    if (needs.length) {
      const prompt = `아래 JSON 배열의 각 가사 줄에 대해, 같은 순서·같은 길이의 JSON 배열로 답해줘.
각 원소는 { "reading": "...", "ko": "..." } 형태.
규칙:
- 줄의 주 언어가 한국어 → ko에 자연스러운 영어 번역, reading은 빈 문자열
- 영어 → ko에 자연스러운 한국어 번역, reading은 빈 문자열
- 일본어 → reading에 한글 독음, ko에 자연스러운 한국어 번역
- 시적 뉘앙스 유지, 직역 금지. JSON만 출력.
곡: "${fmValue(fm, "title")}" (${fmValue(fm, "artist")})
입력:
${JSON.stringify(needs.map((n) => n.text))}`;
      let arr;
      try {
        arr = JSON.parse((await geminiText(key, prompt, true)).replace(/^```json\s*|\s*```$/g, "").trim());
      } catch {
        return Response.json({ error: "Gemini 응답 파싱 실패" }, { status: 502 });
      }
      if (!Array.isArray(arr))
        return Response.json({ error: "Gemini 응답 형식 오류" }, { status: 502 });

      let addedKo = 0;
      let addedReading = 0;
      // bottom-up so earlier indexes stay valid while splicing
      for (let k = needs.length - 1; k >= 0; k--) {
        const n = needs[k];
        const r = arr[k] || {};
        const ins = [];
        if (n.wantReading && r.reading?.trim()) {
          ins.push(`+ ${String(r.reading).trim()}`);
          addedReading++;
        }
        if (n.wantKo && r.ko?.trim()) {
          // 한국어 곡이면 이 ko는 영어 번역이다 — 추가 흐름과 같은 대문자 규칙을
          // 적용한다. 새로 넣는 줄에만 닿으므로 기존 본문은 그대로다.
          ins.push(`> ${capitalizeLyricLines(String(r.ko).trim())}`);
          addedKo++;
        }
        if (!ins.length) continue;
        // "+" sits right under the original; a lone ">" goes after existing "+" lines
        let at = n.i + 1;
        if (!n.wantReading) while (at < lines.length && /^\s*\+/.test(lines[at])) at++;
        lines.splice(at, 0, ...ins);
      }
      if (addedKo) fixed.push(`번역 ${addedKo}줄 추가`);
      if (addedReading) fixed.push(`독음 ${addedReading}줄 추가`);
      fixedBody = lines.join("\n");
    }

    if (!fixed.length) return Response.json({ fixed: [] });
    await writeSong(
      body.slug,
      `---\n${fm}\n---\n${fixedBody.replace(/\n*$/, "\n")}`,
      `fix(song): lint autofix — ${body.slug}`
    );
    return Response.json({ fixed });
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
  // Targeted backfill: fill keywords + emotion WITHOUT touching anything else —
  // regenMeta would also regenerate the comment/tags, clobbering hand-edited
  // ones. This reads only the Korean text of the body (originals of ko songs,
  // `>` translations of en/ja songs; `+` readings and `//` notes excluded).
  if (action === "regenKeywords") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;

    const koText = bodyText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^\[/.test(l) && !/^\+/.test(l) && !/^\/\//.test(l))
      .map((l) => l.replace(/^>\s?/, ""))
      .filter((l) => /[가-힣]/.test(l))
      .join("\n");
    if (!koText) return Response.json({ error: "한국어 가사 텍스트가 없습니다" }, { status: 422 });

    const rawJson = await geminiText(
      key,
      `노래 "${fmValue(fm, "title")}" (${fmValue(fm, "artist")})의 한국어 가사에 대해 JSON으로만 답해줘.
- keywords: 자주 등장하거나 주제를 관통하는 핵심 단어 3~5개의 배열. 반드시 아래 텍스트에 실제로 나오는 단어(명사 위주, 1~6자)만. 문장·구절 금지
- emotion: 이 곡의 감정을 아래 목록에서 정확히 하나만. 목록: ${EMOTIONS.join(", ")}
가사:
${koText.slice(0, 2000)}`,
      true
    );
    let kw = [], emotion = "";
    try {
      const json = JSON.parse(rawJson.replace(/^```json\s*|\s*```$/g, "").trim());
      kw = parseKeywords(json.keywords);
      emotion = parseEmotion(json.emotion);
    } catch {}
    if (!kw.length && !emotion)
      return Response.json({ error: "AI 호출 실패 (쿼터·과부하)" }, { status: 502 });

    let out = raw;
    if (kw.length) out = setField(out, "keywords", `[${kw.join(", ")}]`, "tags");
    if (emotion) out = setField(out, "emotion", emotion, "tags");
    await writeSong(body.slug, out, `chore(song): keywords — ${body.slug}`);
    return Response.json({ keywords: kw, emotion });
  }

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
    // When Gemini is down (quota/503), computeAuto's tags fall back to the coarse
    // store genre + name-script country — worse than what's on disk. Refuse the
    // whole overwrite so a rate-limited run can't silently degrade good metadata.
    if (!auto.aiOk)
      return Response.json({ error: "AI 호출 실패 (쿼터·과부하) — 기존 메타 유지" }, { status: 502 });

    let out = raw;
    const updated = [];
    // tags = country · genre · year only. Overwrite fully so any legacy mood tags
    // are dropped and the year migrates from decade to exact.
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
    // keywords/emotion arrived after the first songs were filed, so this is
    // also their backfill path — anchor after tags, which every song has
    if (auto.keywords.length) {
      out = setField(out, "keywords", `[${auto.keywords.join(", ")}]`, "tags");
      updated.push("keywords");
    }
    if (auto.emotion) {
      // anchored on tags, not keywords — keywords may be absent and setField
      // silently drops the insert when its anchor is missing
      out = setField(out, "emotion", auto.emotion, "tags");
      updated.push("emotion");
    }
    if (!updated.length) return Response.json({ updated: [] });
    await writeSong(body.slug, out, `chore(song): regen metadata — ${body.slug}`);
    return Response.json({ updated });
  }

  // Reclassify ONLY the genre (frontmatter `genre:` + the genre tag), leaving
  // comment/title_ko/artist_ko/lyrics untouched. This is the targeted fix behind
  // the lint tool's "장르 재생성" — cheaper and less destructive than regenMeta.
  if (action === "regenGenre") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const auto = await computeAuto({
      title: fmValue(fm, "title"),
      artist: fmValue(fm, "artist"),
      lyrics: originalLyrics(bodyText),
      lang: fmValue(fm, "lang") || "en",
      year: fmValue(fm, "year"),
      genre: fmValue(fm, "genre"),
    });
    // genre judgment needs the model — a store-genre fallback is what we're fixing
    if (!auto.aiOk)
      return Response.json({ error: "AI 호출 실패 (쿼터·과부하) — 기존 장르 유지" }, { status: 502 });
    const newGenre = genreTagOf(auto.tags);
    const old = genreTagOf(getAllSongs().find((x) => x.slug === body.slug)?.tags || []);
    // rewrite the whole tags line (country·genre·year) so the genre slot updates
    // in place, and sync the frontmatter genre field to match
    let out = setField(raw, "tags", `[${auto.tags.join(", ")}]`, "year");
    if (newGenre) out = setField(out, "genre", newGenre, "year");
    await writeSong(body.slug, out, `chore(song): regen genre — ${body.slug}`);
    return Response.json({ genre: newGenre, changed: newGenre !== old });
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

  // Stanza notes (`// …`). Two ways in: Gemini drafts them for the stanzas that
  // carry the song's weight (regenNotes), and the song page saves a hand-written
  // one for a single stanza (setNote). Both rewrite only the `//` lines.
  if (action === "regenNotes" || action === "setNote") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;

    // blocks match lib/songs.js stanzas: blank-line separated, `//` lines are the note
    const blocks = bodyText.trim().split(/\n\s*\n/).map((b) => b.split("\n"));
    const putNote = (i, note) => {
      const keep = blocks[i].filter((l) => !/^\s*\/\//.test(l));
      blocks[i] = note ? [...keep, `// ${note}`] : keep;
    };
    const commit = (msg) =>
      writeSong(body.slug, `---\n${fm}\n---\n${blocks.map((b) => b.join("\n")).join("\n\n")}\n`, msg);

    if (action === "setNote") {
      const i = Math.floor(body.index);
      if (!(i >= 0 && i < blocks.length))
        return Response.json({ error: "연 번호가 범위를 벗어남" }, { status: 422 });
      const note = String(body.note || "").replace(/\s*\n+\s*/g, " ").trim().slice(0, 400);
      putNote(i, note);
      await commit(`chore(song): ${note ? "edit" : "remove"} note — ${body.slug} #${i}`);
      return Response.json({ note });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const listed = blocks
      .map((b, i) => {
        const lines = b.filter((l) => !/^\s*(>|\+|\/\/|\[)/.test(l) && l.trim());
        return `[${i}] ${lines.join(" / ")}`;
      })
      .join("\n");
    const rawJson = await geminiText(
      key,
      `노래 "${fmValue(fm, "title")}" (${fmValue(fm, "artist")})의 연 목록이다.
곡 전체에서 의미가 가장 깊은 연 2~3개만 골라 해설 노트를 써라.
JSON 배열로만 답하라: [{"index":0,"note":"..."}]
- index: 아래 대괄호 안의 연 번호.
- note: 그 연의 표현·비유·곡 안에서의 역할을 짚는 해설 1~2문장. 반드시 평서문 '~다'체. 가사를 그대로 옮겨 적지 말 것.
${listed}`,
      true
    );
    let notes;
    try {
      notes = JSON.parse(rawJson.replace(/^```json\s*|\s*```$/g, "").trim());
    } catch {
      return Response.json({ error: "해설 생성 실패" }, { status: 502 });
    }
    const applied = (Array.isArray(notes) ? notes : []).filter(
      (n) => Number.isInteger(n?.index) && n.index >= 0 && n.index < blocks.length && n.note
    );
    if (!applied.length) return Response.json({ error: "해설 생성 실패" }, { status: 502 });
    for (const n of applied)
      putNote(n.index, String(n.note).replace(/\s*\n+\s*/g, " ").trim().slice(0, 400));
    await commit(`chore(song): regen notes — ${body.slug}`);
    return Response.json({ notes: applied.length });
  }

  // Re-stanza one stored song on demand (the manual admin tool). The core logic
  // lives in restanzaBody, shared with the auto-restanza on save.
  if (action === "restanza") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const newBody = await restanzaBody({
      title: fmValue(fm, "title"),
      artist: fmValue(fm, "artist"),
      bodyText,
      key,
    });
    if (!newBody)
      return Response.json({ error: "연 정리 실패 — 가사가 짧거나 구조가 안 맞음" }, { status: 502 });
    await writeSong(body.slug, `---\n${fm}\n---\n${newBody}\n`, `chore(song): restanza — ${body.slug}`);
    return Response.json({ stanzas: newBody.split("\n\n").length });
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

  // ── movies ────────────────────────────────────────────────────────────────
  // TMDB search/detail mirror the iTunes song flow. Quotes are hand-typed (no
  // lyric DB for films), so the movie form is search → detail → type quotes →
  // Gemini translate + comment → save.
  if (action === "movieSearch") {
    return Response.json({ results: await searchMovies(body.query) });
  }

  if (action === "movieDetail") {
    return Response.json(await movieDetail(body.tmdbId, body.mediaType));
  }

  // Polish the auto-loaded TMDB synopsis into clean 줄거리 prose and draft a
  // personal comment. Country·genre·year tags are deterministic.
  if (action === "movieMeta") {
    const key = process.env.GEMINI_API_KEY;
    const { title, director, mediaType, synopsis, country, genre, year, rating, tmdbRating, tmdbVotes } = body;
    const kind = mediaType === "tv" ? "드라마" : "영화";
    let polished = (synopsis || "").trim();
    let comment = "";
    if (key) {
      if (polished) {
        const p = (
          await geminiText(
            key,
            `${kind} "${title}"의 줄거리를 아래 원문을 바탕으로 정돈해줘. 맞춤법·어색한 번역투를 다듬고 핵심 줄거리만 2~4문장의 깔끔한 한국어 평서문으로. 과한 스포일러 금지. 줄거리 문장만 출력(제목·머리말 없이).\n원문:\n${polished.slice(0, 1500)}`
          )
        )
          .replace(/^["']|["']$/g, "")
          .trim();
        if (p) polished = p;
      }
      comment = await movieComment({ key, title, director, mediaType, rating, synopsis: polished, tmdbRating, tmdbVotes });
      if (!comment) return Response.json({ error: "코멘트 생성 실패" }, { status: 502 });
    }
    const tags = [country || "기타", capGenre(genre), year && String(year)].filter(Boolean);
    return Response.json({ polished, comment, tags: tags.join(", ") });
  }

  if (action === "movieSave") {
    const { title, titleKo, mediaType, director, directorKo, cast, year, runtime, rating, genre, poster, backdrop, tmdbId, tags, comment, synopsis } = body;
    const slug = `${title} ${year}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
      .replace(/^-|-$/g, "");
    const md = `---
title: ${title}
title_ko: ${titleKo || title}
media: ${mediaType === "tv" ? "tv" : "movie"}
director: ${director || ""}
director_ko: ${directorKo || ""}
cast: ${cast || ""}
year: ${year || ""}
runtime: ${runtime || ""}
rating: ${rating || ""}
genre: ${genre || ""}
poster: ${poster || ""}
backdrop: ${backdrop || ""}
tmdbId: ${tmdbId || ""}
tags: [${(tags || "").split(",").map((t) => t.trim()).filter(Boolean).join(", ")}]
date: ${new Date().toISOString().slice(0, 10)}
published: ${new Date().toISOString()}
comment: ${(comment || "").replace(/\s*\n+\s*/g, " ")}
---
${(synopsis || "").trim()}
`;
    await writeMovie(slug, md, `add(movie): ${slug}`);
    return Response.json({ slug });
  }

  if (action === "movieRegenMeta" || action === "movieRegenComment") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const movie = await readMovie(body.slug);
    if (!movie) return Response.json({ error: "작품을 찾을 수 없음" }, { status: 404 });
    const raw = movie.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;

    const title = fmValue(fm, "title_ko") || fmValue(fm, "title");
    const director = fmValue(fm, "director_ko") || fmValue(fm, "director");
    const mediaType = fmValue(fm, "media") || "movie";
    const rating = fmValue(fm, "rating");
    const comment = await movieComment({ key, title, director, mediaType, rating, synopsis: bodyText });
    if (!comment) return Response.json({ error: "코멘트 생성 실패" }, { status: 502 });

    let out = setField(raw, "comment", comment, "published");
    const updated = ["comment"];

    if (action === "movieRegenMeta") {
      let polished = bodyText.trim();
      if (polished) {
        const kind = mediaType === "tv" ? "드라마" : "영화";
        const p = (
          await geminiText(
            key,
            `${kind} "${title}"의 줄거리를 아래 원문을 바탕으로 정돈해줘. 맞춤법·어색한 번역투를 다듬고 핵심 줄거리만 2~4문장의 깔끔한 한국어 평서문으로. 과한 스포일러 금지. 줄거리 문장만 출력(제목·머리말 없이).\n원문:\n${polished.slice(0, 1500)}`
          )
        )
          .replace(/^["']|["']$/g, "")
          .trim();
        if (p) {
          polished = p;
          updated.push("synopsis");
        }
      }
      const tags = [
        parseTags(fmValue(fm, "tags"))[0] || "기타",
        capGenre(fmValue(fm, "genre")),
        fmValue(fm, "year"),
      ].filter(Boolean);
      if (tags.length) {
        out = setField(out, "tags", `[${tags.join(", ")}]`, "tmdbId");
        updated.push("tags");
      }
      out = out.replace(FM, (_, nextFm) => `---\n${nextFm}\n---\n${polished.replace(/\n*$/, "\n")}`);
    }

    await writeMovie(
      body.slug,
      out,
      action === "movieRegenMeta"
        ? `chore(movie): regen metadata — ${body.slug}`
        : `chore(movie): regen comment — ${body.slug}`
    );
    return Response.json({ comment, updated });
  }

  if (action === "movieUpdateRating") {
    const movie = await readMovie(body.slug);
    if (!movie) return Response.json({ error: "작품을 찾을 수 없음" }, { status: 404 });
    const rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5)
      return Response.json({ error: "별점은 0~5 사이여야 합니다" }, { status: 422 });
    const rounded = Math.round(rating * 2) / 2;
    const out = setField(movie.raw.replace(/\r\n/g, "\n"), "rating", rounded ? String(rounded) : "", "runtime");
    await writeMovie(body.slug, out, `edit(movie): update rating — ${body.slug}`);
    return Response.json({ rating: rounded });
  }

  if (action === "movieDelete") {
    await deleteMovie(body.slug);
    return Response.json({ ok: true });
  }

  if (action === "save") {
    const { title, titleKo, artist, artistKo, album, year, artwork, lang, tags, comment, lyrics, preview, trackId, duration, genre, keywords, emotion } = body;
    const slug = `${artist} ${title}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
      .replace(/^-|-$/g, "");
    // catches the paths that skip translation: a hand-typed body, and the
    // "이대로 사용" bypass that copies Korean lyrics over verbatim
    let lyricBody = capitalizeLyricLines(lyrics.trim());
    // auto-restanza on publish — reorganize the lyrics by musical structure.
    // Best-effort: if Gemini is down or the body is too short, keep it as typed.
    try {
      const restanza = await restanzaBody({
        title,
        artist,
        bodyText: lyricBody,
        key: process.env.GEMINI_API_KEY,
      });
      if (restanza) lyricBody = restanza;
    } catch {} // never block a publish on the layout pass
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
keywords: [${parseKeywords(keywords).join(", ")}]
emotion: ${parseEmotion(emotion)}
date: ${new Date().toISOString().slice(0, 10)}
published: ${new Date().toISOString()}
comment: ${(comment || "").replace(/\s*\n+\s*/g, " ")}
---
${lyricBody}
`;
    await writeSong(slug, md, `add(song): ${slug}`);
    return Response.json({ slug });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
