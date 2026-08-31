const CATEGORY_TONES = {
  "풍경": "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "몸과 감각": "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  "장소와 사물": "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "시간과 기억": "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "감정과 관계": "border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  "파괴와 변화": "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300",
  "움직임": "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "몸짓": "border-orange-500/35 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  "생과 죽음": "border-slate-500/35 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

const CATEGORY_TEXT_TONES = {
  "풍경": "text-sky-700 dark:text-sky-300",
  "몸과 감각": "text-rose-700 dark:text-rose-300",
  "장소와 사물": "text-amber-700 dark:text-amber-300",
  "시간과 기억": "text-violet-700 dark:text-violet-300",
  "감정과 관계": "text-fuchsia-700 dark:text-fuchsia-300",
  "파괴와 변화": "text-red-700 dark:text-red-300",
  "움직임": "text-emerald-700 dark:text-emerald-300",
  "몸짓": "text-orange-700 dark:text-orange-300",
  "생과 죽음": "text-slate-700 dark:text-slate-300",
};

const YEAR_TONES = [
  "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300",
  "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
];

const NEUTRAL_TONE = "border-line bg-surface text-muted";

export function motifCategoryTone(category) {
  return CATEGORY_TONES[category] || NEUTRAL_TONE;
}

export function motifCategoryTextTone(category) {
  return CATEGORY_TEXT_TONES[category] || "text-muted";
}

export function motifYearTone(year) {
  const number = Number.parseInt(String(year), 10);
  return Number.isFinite(number) ? YEAR_TONES[Math.abs(number) % YEAR_TONES.length] : NEUTRAL_TONE;
}
