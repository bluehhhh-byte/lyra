// 곡 메타 생성·가공 헬퍼 — 번역·자동태그·재연·노트·줄 수 등 곡 도메인 전용.
import { geminiText, GEMINI_LITE_MODEL } from "./gemini.js";
import { capitalizeLyricLines } from "../songs.js";
import { GENRES, capGenre, COUNTRY_TAGS } from "../genre.js";
import { EMOTIONS, parseKeywords, parseEmotion } from "../keywords.js";

// 일본어(가나·한자) 이름이면 한글 독음이 필요하다; 라틴 이름은 아니다.
export const needsReading = (artist) => /[぀-ヿ㐀-鿿]/.test(artist || "");

export const commentPrompt = (title, artist, lyrics) =>
  `노래 "${title}" (${artist})에 대한 개인 음악 블로그용 코멘트를 한국어 1~2문장으로 써줘. 가사의 의미와 이 곡에 얽힌 실제 배경·일화를 녹여서. 반드시 평서문 '~다'체(예: ~한다, ~이다, ~같다, ~된다)로 끝맺을 것. "~습니다/~합니다/~해요/~함/~음" 금지. 담백한 톤. 코멘트 문장만 출력.\n가사:\n${(lyrics || "").slice(0, 2000)}`;

// 일본어-우세 줄에만 독음을 준다 — 가나 몇 자 낀 한국어/영어 줄에 붙으면 엉뚱한 중복.
export const isJaLine = (s) =>
  /[぀-ヿ]/.test(s) &&
  !/[가-힣]/.test(s) &&
  (s.match(/[぀-ヿ㐀-鿿]/g) || []).length >= (s.match(/[a-z]/gi) || []).length;

// Line-aware bilingual output — one song may mix Korean, English and Japanese
// lines (K-pop verse with an English hook, a Japanese bridge). Each line is
// annotated toward "the other side": Korean → English, English/Japanese →
// Korean (+ 독음 for Japanese). The parser and the renderer are already
// per-line, so a single interleaved pass covers any mix; `lang` is only a hint.
export async function translateLyrics(key, { title, artist, lang, lyrics }) {
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
export function normalizeInterleaved(text) {
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
export async function restanzaBody({ title, artist, bodyText, key }) {
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
    true,
    GEMINI_LITE_MODEL // 구조 분할은 기계적 — lite의 별도 쿼터로
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
export async function computeAuto({ title, artist, lyrics, lang, year, genre }) {
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
        true,
        GEMINI_LITE_MODEL // 태그·키워드·감정은 분류 작업 — 일괄 재생성의 쿼터 주범이라 lite로
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

// The body interleaves translation (`>`), reading (`+`) and note (`//`) lines —
// strip them so Gemini reads the original lyric, not our annotations.
export const originalLyrics = (body) =>
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
