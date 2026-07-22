// Keyword + daily-emotion vocabulary and validation, shared by the admin API
// (Gemini extraction) and the pages that render them. Plain module so
// lib/keywords.test.mjs can exercise it without the Next runtime.
//
// keywords — 3~5 words Gemini picks FROM THE TRANSLATED LYRIC (frequent or
// thematic). Open vocabulary on purpose: they don't group into an index, they
// link into the existing lyric search (/?q=단어), so synonym drift is harmless.
//
// emotion — ONE word for the song's feeling, from a closed list. This one IS
// aggregated (the stats diary names each day by its dominant emotion), and an
// open vocabulary would split "슬픔/슬픈/애상" into three days that never match.

export const EMOTIONS = [
  "사랑", "설렘", "그리움", "이별", "슬픔", "고독", "위로", "희망",
  "기쁨", "분노", "저항", "불안", "체념", "회상", "몽환",
];
const EMOTION_SET = new Set(EMOTIONS);

// Only a vocabulary term counts — a near-miss becomes "no emotion", never a
// wrong one that ships to the diary.
export const parseEmotion = (v) => {
  const t = String(v ?? "").trim();
  return EMOTION_SET.has(t) ? t : "";
};

// Emotions are unordered labels, so a "감정 변화" line has no y-axis on its own.
// This maps each to a rough valence (밝음 ↔ 어두움) purely to give the diary
// timeline a vertical position — it's a subjective affective approximation, not
// a claim about the song. Tune freely; the chart re-reads it. Range -3..+3.
const EMOTION_VALENCE = {
  기쁨: 3, 사랑: 3, 희망: 2, 설렘: 2, 위로: 1,
  회상: 0, 몽환: 0,
  그리움: -1, 체념: -1, 저항: -1,
  불안: -2, 고독: -2, 분노: -2,
  슬픔: -3, 이별: -3,
};
export const emotionValence = (e) => EMOTION_VALENCE[parseEmotion(e)] ?? 0;
export const VALENCE_RANGE = [-3, 3];

// warm (bright/positive) → cool (dark/negative), so the dot color reinforces its
// height on the valence axis. oklch keeps the steps evenly bright.
export function valenceColor(v) {
  const t = (Math.max(-3, Math.min(3, v)) + 3) / 6; // 0..1, 0 = darkest
  const hue = 250 - t * 210; // 250 (blue) → 40 (amber)
  return `oklch(0.72 0.13 ${hue.toFixed(0)})`;
}

const MAX_KEYWORDS = 5;

// Gemini returns an array, or sometimes one comma-joined string. Keep short
// word-like entries only — a whole lyric line sneaking in as a "keyword" would
// become a uselessly specific search chip.
export function parseKeywords(v) {
  const arr = Array.isArray(v) ? v : String(v ?? "").split(",");
  const out = [];
  for (const raw of arr) {
    const w = String(raw ?? "").trim().replace(/^#/, "");
    if (!w || w.length > 12 || /[\n">]/.test(w)) continue;
    if (!out.includes(w)) out.push(w);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}
