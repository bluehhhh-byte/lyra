// Single source of the mood vocabulary + validation, shared by the admin API
// (auto-tagging) and the pages that render it. Plain module so lib/mood.test.mjs
// can exercise it without a browser or the Next runtime.
//
// A song carries two mood fields, because one number can't say what a lyric is
// about:
//   mood       1–5  how loud the song feels — 잔잔 → 격렬. Ordered, so it can be
//                   drawn as a wave/graph.
//   mood_label      what it feels ABOUT — one word from a closed list. Unordered,
//                   so it groups and filters like a tag.
// Tags stay country · genre · year; mood lives in its own fields rather than
// getting mixed into the tag index, where an unordered list would lose the scale.

// 1 is the quietest. The index into this array is `mood - 1`.
export const MOOD_LEVELS = [
  { level: 1, name: "잔잔", hint: "고요하고 느린 곡" },
  { level: 2, name: "차분", hint: "잔잔하지만 움직임이 있는 곡" },
  { level: 3, name: "보통", hint: "일상적인 세기" },
  { level: 4, name: "고조", hint: "힘이 실리고 밀어붙이는 곡" },
  { level: 5, name: "격렬", hint: "터뜨리는 곡" },
];

// Closed list, same reasoning as GENRES: free-form labels would sprout a synonym
// per song ("그리움"/"그리워"/"애틋함") and the index would never group.
// Chosen for what lyrics are actually about, not for a general emotion wheel.
export const MOOD_LABELS = [
  "사랑", "설렘", "그리움", "이별", "슬픔", "고독", "위로", "희망",
  "기쁨", "분노", "저항", "불안", "체념", "회상", "몽환",
];
const LABEL_SET = new Set(MOOD_LABELS);

// Accepts the number, the level name ("잔잔"), or a numeric string — Gemini
// returns whichever it feels like. Anything else is not a mood.
export function parseMoodLevel(v) {
  if (typeof v === "string") {
    const byName = MOOD_LEVELS.find((m) => m.name === v.trim());
    if (byName) return byName.level;
  }
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

// Only a vocabulary term counts. A near-miss is dropped rather than coerced —
// a wrong label is worse than none, and the field is optional everywhere.
export const parseMoodLabel = (v) => {
  const t = String(v ?? "").trim();
  return LABEL_SET.has(t) ? t : "";
};

export const moodName = (level) => MOOD_LEVELS[parseMoodLevel(level) - 1]?.name || "";

// One hue ramp from cool/quiet to warm/loud, so a row of songs reads as a
// gradient. oklch keeps the steps evenly bright — a plain HSL ramp makes the
// yellow end glare next to the blue end.
export const MOOD_COLORS = [
  "oklch(0.72 0.09 240)", // 1 잔잔 — cool blue
  "oklch(0.74 0.10 190)", // 2 차분 — teal
  "oklch(0.76 0.11 145)", // 3 보통 — green
  "oklch(0.78 0.13 75)", //  4 고조 — amber
  "oklch(0.70 0.17 25)", //  5 격렬 — red
];
export const moodColor = (level) => MOOD_COLORS[parseMoodLevel(level) - 1] || "var(--color-line)";
