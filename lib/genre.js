// Single source of the genre vocabulary + validation, shared by the admin API
// (auto-tagging) and the lint tool. Plain module so lib/genre.test.mjs can
// exercise it without a browser or the Next runtime.

// Genre vocabulary — specific over broad ("Hard Rock", not "Rock"). Closed list
// so the tag index doesn't sprout a synonym per song. The iTunes store genre is
// only a hint: it files 시나위(헤비메탈) and 장기하(인디록) both as "K-Pop",
// so Gemini, which knows the act, picks from this list and the store genre is
// just the fallback when Gemini is unavailable.
export const GENRES = [
  // rock family
  "Rock", "J-Rock", "Hard Rock", "Alternative Rock", "Indie Rock", "Punk Rock", "Post-Punk",
  "Post-Rock", "Grunge", "Shoegaze", "Emo", "Metal", "Heavy Metal", "Visual Kei",
  // pop family
  "Pop", "K-Pop", "J-Pop", "Indie Pop", "Dream Pop", "Synth-Pop", "City Pop", "Ballad", "Trot",
  // rhythm / electronic / other
  "R&B/Soul", "Hip-Hop", "Funk", "Disco", "Dance", "House", "Electronic",
  "Folk", "Country", "Jazz", "Blues", "Classical", "Soundtrack",
];
const GENRE_INDEX = new Map(GENRES.map((g) => [g.toLowerCase(), g]));

// Korean genre words map to the English vocabulary — a stray Hangul genre tag
// ("얼터너티브") must never survive into the tag index.
const KO_GENRE = new Map([
  ["얼터너티브", "Alternative Rock"], ["얼터너티브 락", "Alternative Rock"], ["얼터너티브 록", "Alternative Rock"],
  ["락", "Rock"], ["록", "Rock"], ["제이락", "J-Rock"], ["제이록", "J-Rock"], ["하드락", "Hard Rock"], ["하드 락", "Hard Rock"],
  ["인디락", "Indie Rock"], ["인디 락", "Indie Rock"], ["인디 록", "Indie Rock"], ["인디록", "Indie Rock"],
  ["펑크락", "Punk Rock"], ["펑크 락", "Punk Rock"], ["포스트펑크", "Post-Punk"], ["슈게이즈", "Shoegaze"],
  ["메탈", "Metal"], ["헤비메탈", "Heavy Metal"], ["비주얼계", "Visual Kei"], ["비주얼 케이", "Visual Kei"],
  ["발라드", "Ballad"], ["트로트", "Trot"], ["힙합", "Hip-Hop"], ["재즈", "Jazz"], ["블루스", "Blues"],
  ["디스코", "Disco"], ["댄스", "Dance"], ["하우스", "House"], ["일렉트로닉", "Electronic"], ["포크", "Folk"],
]);

// map a free-form store genre onto the vocabulary; unknown ones just get capitalized
export const capGenre = (g) => {
  const t = (g || "").trim();
  return GENRE_INDEX.get(t.toLowerCase()) || KO_GENRE.get(t) || t.replace(/^./, (c) => c.toUpperCase());
};

export const COUNTRY_TAGS = ["한국", "일본", "영미", "기타"];
const isYearTag = (t) => /^\d{4}s?$/.test(t); // 2018 or legacy 2010s

// the genre tag is the one that's neither country nor year
export const genreTagOf = (tags = []) =>
  tags.find((t) => !COUNTRY_TAGS.includes(t) && !isYearTag(t)) || "";

// Deterministic genre red-flags — the classes we've had to hand-fix. Returns a
// short Korean reason, or null when the tag is a clean, specific genre.
//   - missing        → no genre tag at all
//   - 비표준 장르     → not in the English vocabulary (Hangul word, or a store
//                      genre like "Alternative" that should be "Alternative Rock")
//   - 세분화 권장     → the bare umbrella "Rock"/"Pop" (a sub-genre almost always fits)
export function genreIssue(tag) {
  const t = (tag || "").trim();
  if (!t) return "장르 없음";
  if (!GENRE_INDEX.has(t.toLowerCase())) return "비표준 장르";
  if (t === "Rock" || t === "Pop") return "세분화 권장";
  return null;
}
