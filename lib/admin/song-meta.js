// 곡 메타 생성·가공 헬퍼 — 번역·자동태그·재연·노트·줄 수 등 곡 도메인 전용.
import { geminiText, GEMINI_LITE_MODEL } from "./gemini.js";
import { capitalizeLyricLines } from "../songs.js";
import { GENRES, capGenre, COUNTRY_TAGS } from "../genre.js";
import { EMOTIONS, parseKeywords, parseEmotion } from "../keywords.js";
import { LISTEN_WHEN_RULE, cleanListenWhen } from "../listen-when.js";

// 한글 제목 규칙 — 곡 등록과 누락 보정 두 경로가 같은 문장을 쓴다.
//
// 예전 지시는 "영어·고유명사는 한글 음역, 뜻있는 제목은 번역"이었다. 앞쪽 절이
// 넓게 읽혀서 뜻이 분명한 제목까지 소리대로 적혔다 — Green이 "그린", Baby가
// "베이비"가 됐다. 사이트는 가사를 번역해 읽는 곳인데 제목만 소리로 남으면
// 목록에서 무슨 곡인지 알 수 없다.
//
// 그래서 기본값을 뒤집는다: 번역이 원칙이고 음역이 예외다.
export const TITLE_KO_RULE =
  "titleKo: 이 필드는 한글 독음이나 발음 표기가 아니라 제목의 한국어 번역이다. " +
  "영어·일본어 제목의 뜻을 자연스러운 한국어로 옮겨라. 원칙은 뜻으로 번역하는 것이다" +
  "(Yesterday→어제, Green→초록, Moonlight→달빛, Footsteps→발소리, It's Late→늦었어, 忘れらんねえよ→잊을 수 없어). " +
  "뜻이 있는 제목을 소리대로만 적지 마라(Yesterday→예스터데이 금지, Green→그린 금지). " +
  "소리대로 적는 음역은 다음 세 경우에만 쓴다: " +
  "(1) 인명·지명·상표 같은 고유명사(Sisyphus→시시포스, Cassiopeia→카시오페아), " +
  "(2) 뜻이 없는 조어나 의성어, " +
  "(3) 번역하면 오히려 뜻이 흐려지는 정착 외래어(Tango→탱고). " +
  "일본어 제목도 같다 — 한자·가나의 뜻을 옮기고, 독음은 고유명사일 때만 쓴다" +
  "(第ゼロ感→0번째 감각). " +
  "제목 일부만 고유명사면 그 부분만 음역하고 나머지는 번역한다. " +
  "번역과 음역 사이에서 망설여지면 번역을 택한다.";

// 일본어(가나·한자) 이름이면 한글 독음이 필요하다; 라틴 이름은 아니다.
export const needsReading = (artist) => /[぀-ヿ㐀-鿿]/.test(artist || "");

export const COMMENT_ANGLES = [
  "가사가 그리는 장면이나 상황을 그대로 옮겨 적어라.",
  "가사가 건네는 통찰이나 깨달음을 짚어라 — 이 곡이 삶이나 관계에 대해 무엇을 알려주는지.",
  "이 곡이 필요한 순간이나 사람을 그려라 — 어떤 밤, 어떤 마음 상태에 이 곡이 와닿는지.",
  "가사보다 소리의 질감과 정서적 공기를 먼저 말하라 — 이 곡이 어떤 분위기를 만드는지.",
  "가사 중 가장 인상적인 한 구절이나 이미지 하나만 붙잡고 그것이 왜 남는지 풀어라.",
  "곡이 흘러가며 감정이 어떻게 움직이는지 — 시작과 끝의 정서 변화를 그려라.",
];

export const commentPrompt = (title, artist, lyrics) => {
  const lyricText = String(lyrics || "").trim();
  const basis = lyricText
    ? `웹 근거가 제공되지 않았으므로 영화·드라마 사용, 제작 일화, 아티스트 당시 상황 같은 외부 사실은 기억으로 덧붙이지 마라.\n가사:\n${lyricText.slice(0, 2000)}`
    : "가사가 없는 연주곡이거나 원문을 확인할 수 없는 곡이다. 가사를 지어내거나 가사의 의미를 언급하지 말고, 곡의 구성·연주·음색·분위기만 바탕으로 써줘. 웹 근거 없는 외부 배경은 덧붙이지 마라.";
  const angle = lyricText ? COMMENT_ANGLES[Math.floor(Math.random() * COMMENT_ANGLES.length)] : "";
  return `노래 "${title}" (${artist})에 대한 개인 음악 블로그용 코멘트를 한국어 정확히 두 문장으로 써줘. ${angle} ${basis} 매번 같은 문장 틀("~한다. ~라는 문장이 곡의 중심이다" 같은 상투구)을 반복하지 마라. 반드시 평서문 "~다"체(예: ~한다, ~이다, ~같다, ~된다)로 끝맺을 것. 큰따옴표 안 "~습니다/~합니다/~해요/~함/~음" 금지. 담백한 톤. 코멘트 문장만 출력.`;
};

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
- Direction is decided PER LINE by the line's dominant language. The primary language hint never flips a line's direction: a Korean line ALWAYS gets " > " + a natural English translation, even when the hint is en or ja; an English line ALWAYS gets " > " + a natural Korean translation.
- A line mixing Korean and English follows its dominant language: a Korean-dominant line gets one English translation covering the whole line (including its English words); an English-dominant line gets one Korean translation covering the whole line (including its Korean words).
- Never output a translation identical to the original line. Never "translate" a line into the language it is already written in — a Korean line's annotation must contain English words, an English line's annotation must contain Korean text.
- Lines that are credits or annotations, not lyrics — "Chorus: Ozzy Osbourne & Post Malone", "feat. Park Hyo-shin", "(Producer: name)", "Performed by X & Y" — get NO translation line. Keep them as-is.
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
export async function computeAuto({ title, artist, lyrics, lang, year, genre, album, instrumental }) {
  let country = countryOf({ artist, genre, lang }); // deterministic baseline
  let genreTag = genre ? capGenre(genre) : ""; // store genre — the fallback
  let titleKo = lang === "ko" ? title : "";
  let artistKo = "";
  let comment = "";
  let keywords = []; // 번역 가사의 핵심 단어 3~5개
  let emotion = ""; // 닫힌 목록의 감정 한 단어 — 통계 일기가 날짜별로 집계
  let listenWhen = ""; // 커버 카드의 "이런 순간에" 장면 한 줄
  let aiOk = false; // did the Gemini call actually return usable fields?

  // one combined Gemini call (avoids free-tier rate limits from many calls)
  const key = process.env.GEMINI_API_KEY;
  if (key && lyrics) {
    try {
      const raw = await geminiText(
        key,
        `노래 "${title}" (${artist})에 대해 아래 스키마의 JSON으로 답해줘.
- country: 아티스트의 국적 기준 분류 — "한국"|"일본"|"영미"|"유럽"|"아시아"|"중남미"|"중동"|"기타" 중 하나. 가수의 출신·주 활동권 기준이며 가사 언어와 무관 (예: 뉴진스는 영어 가사여도 한국). 영미 = 미국·영국·캐나다·호주, 유럽 = 대륙 유럽(독일·프랑스·북유럽 등), 아시아 = 한국·일본 제외 아시아, 중남미 = 멕시코·브라질 등, 중동 = 이란·튀르키예 등
- genre: 이 곡의 세부 장르를 아래 목록에서 정확히 하나만 골라라. 가능한 한 구체적으로 — 록이면 "Rock"보다 "Hard Rock"/"Alternative Rock"/"Indie Rock" 등 하위 장르를 고른다. "K-Pop"/"J-Pop"은 아이돌·주류 아이돌팝 아티스트에 한정하고, 밴드·록/메탈/인디·싱어송라이터는 아이돌이어도 실제 사운드의 록/메탈/인디/포크 하위장르로 분류한다(예: 시나위→Heavy Metal, 장기하→Indie Rock, GLAY·Dir en grey→J-Rock). 목록: ${GENRES.join(", ")}${genre ? `\n  (참고: 음원사 분류는 "${genre}"지만 부정확할 수 있다 — 음원사는 한국 록/메탈 밴드도 K-Pop으로 뭉뚱그린다. 곡의 실제 사운드를 우선하라)` : ""}
- ${TITLE_KO_RULE}
- artistKo: 아티스트명이 일본어/한자면 한글 독음, 그 외에는 빈 문자열
- comment: 뒤의 근거 기반 웹 리서치 전까지 쓰는 임시 감상이다. 번역 가사의 구체적인 이미지와 의미만으로 1~2문장을 쓰고, 영화·드라마 사용, 제작 일화, 아티스트 당시 상황 같은 외부 사실은 기억으로 덧붙이지 마라. 반드시 평서문 '~다'체(예: ~한다, ~이다, ~같다, ~된다)로 끝맺을 것. "~습니다/~합니다/~해요/~함/~음" 금지. 담백한 톤
- keywords: 한국어 번역 가사에서 자주 등장하거나 주제를 관통하는 핵심 단어 3~5개의 배열. 반드시 번역문에 실제로 나오는 단어(명사 위주, 1~6자)만. 문장·구절 금지
- emotion: 이 곡의 감정을 아래 목록에서 정확히 하나만. 목록: ${EMOTIONS.join(", ")}
- ${LISTEN_WHEN_RULE()}
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
      listenWhen = cleanListenWhen(json.listenWhen);
    } catch {} // Gemini 실패해도 국가·장르·연도 태그는 유지
  } else if (key) {
    // 가사가 없는 곡 — 연주곡이거나 원문을 어디서도 구하지 못한 경우다. 예전에는
    // 위 조건(`key && lyrics`)에 걸려 Gemini를 아예 부르지 않았고, 그래서 한글 제목과
    // 코멘트가 영영 빈 채로 남았다. 가사가 없어도 제목·아티스트·앨범·연도·장르는 있으니
    // 그만큼으로 답할 수 있는 것만 묻는다.
    //
    // 키워드와 감정은 묻지 않는다. 둘 다 "번역 가사에 실제로 나오는 말"을 근거로 삼는
    // 값이라, 가사가 없으면 지어내는 수밖에 없다. needs.js가 lyrics_none 곡에서 이 둘을
    // 대기열에서 빼 주므로 비워 두는 편이 맞다.
    try {
      const raw = await geminiText(
        key,
        `노래 "${title}" (${artist})에 대해 아래 스키마의 JSON으로 답해줘.
${instrumental ? "이 곡은 가사가 없는 연주곡이다. 곡의 구성·연주·음색·분위기를 중심으로 판단하고 가사를 지어내지 마라." : "이 곡은 가사가 없거나 원문을 구하지 못했다. 가사를 지어내지 마라."}
- country: 아티스트의 국적 기준 분류 — "한국"|"일본"|"영미"|"유럽"|"아시아"|"중남미"|"중동"|"기타" 중 하나. 가수의 출신·주 활동권 기준이다
- genre: 이 곡의 세부 장르를 아래 목록에서 정확히 하나만. 목록: ${GENRES.join(", ")}${genre ? `\n  (참고: 음원사 분류는 "${genre}"지만 부정확할 수 있다)` : ""}
- ${TITLE_KO_RULE}
- artistKo: 아티스트명이 일본어/한자면 한글 독음, 그 외에는 빈 문자열
- comment: 이 곡에 대한 담백한 임시 감상 1~2문장. 반드시 평서문 '~다'체로 끝맺을 것("~습니다/~합니다/~해요/~함/~음" 금지). 웹 근거가 없으므로 배경·일화·작품 사용을 기억으로 덧붙이지 말고 제목·아티스트·장르·발매 시기${instrumental ? "·구성·연주·음색" : ""}에서 읽히는 인상만 적어라. 가사 내용을 아는 척하지 마라
${[album && `앨범: ${album}`, year && `발매: ${year}`, genre && `음원사 장르: ${genre}`].filter(Boolean).join("\n")}`,
        true,
        GEMINI_LITE_MODEL
      );
      const json = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
      aiOk = true;
      if (COUNTRY_TAGS.includes(json.country)) country = json.country;
      const g = capGenre(json.genre);
      if (GENRES.includes(g)) genreTag = g;
      if (!titleKo && json.titleKo) titleKo = String(json.titleKo).trim();
      if (json.artistKo) artistKo = String(json.artistKo).trim();
      if (json.comment) comment = String(json.comment).replace(/\s*\n+\s*/g, " ").trim();
    } catch {}
  }

  const tags = [country];
  // a Korean act released through the JP store carries a "J-Pop" store genre
  // (and vice versa) — realign the region-genre with the artist's country
  if (country === "한국" && genreTag === "J-Pop") genreTag = "K-Pop";
  if (country === "일본" && genreTag === "K-Pop") genreTag = "J-Pop";
  if (genreTag) tags.push(genreTag);
  if (year) tags.push(String(year)); // exact release year, not the decade
  return { tags, titleKo, artistKo, comment, keywords, emotion, listenWhen, aiOk };
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

// 번역 줄만 갈아 끼운다 — 원문은 건드리지 않는다.
//
// items는 `{ en, was, now }`의 배열이다. 원문 줄 `en`을 찾아 그 바로 아래의
// `> ` 줄이 아직 `was`일 때만 `now`로 바꾼다. `was`가 다르면 그 사이에 누가
// 손댄 것이므로 건너뛴다.
//
// 같은 원문이 여러 번 나오면(후렴) 전부 바꾼다. 첫 자리만 고치면 두 번째부터는
// 이미 바뀐 줄을 보게 되어 was가 어긋나고 조용히 빠진다 — 실제로 13줄 중 5줄이
// 그렇게 빠졌다. 같은 원문에 같은 번역이 들어가는 것이 docs/TRANSLATION.md §3이다.
export function replaceTranslations(body, items = []) {
  const src = String(body || "").split("\n");
  const byOriginal = new Map();
  for (const item of items) {
    const key = String(item.en || "").trim();
    if (key && !byOriginal.has(key)) byOriginal.set(key, item);
  }

  let changed = 0;
  const missed = [];
  for (const [original, item] of byOriginal) {
    let hit = 0;
    for (let i = 0; i < src.length; i++) {
      if (src[i].trim() !== original) continue;
      // 번역이 원문 바로 아래에 있으리라 단정하지 않는다 — 일본어 줄은 사이에
      // `+ 독음`이 끼고(뉴진스 <Supernatural>), 그걸 번역으로 보면 그 줄은
      // 영영 건너뛰어진다. `+`만 넘어가고 `>`를 만나면 멈춘다.
      let at = i + 1;
      while ((src[at] || "").trim().startsWith("+")) at++;
      const below = src[at] || "";
      // `>^N`은 건드리지 않는다. 여러 원문 줄을 한 번에 덮는 번역이라 평범한 `> `로
      // 바꾸면 덮던 범위가 깨진다. 애초에 koMerged 줄은 대상에서 빠져 있으므로
      // 여기까지 올 일이 없지만, 오면 조용히 망가지는 쪽이라 막아 둔다.
      if (!/^\s*>(?!\^)/.test(below)) continue;
      if (below.replace(/^\s*>\s*/, "").trim() !== String(item.was).trim()) continue;
      src[at] = `> ${item.now}`;
      hit++;
    }
    if (hit) changed += hit;
    else missed.push(original);
  }
  return { body: src.join("\n"), changed, missed };
}
