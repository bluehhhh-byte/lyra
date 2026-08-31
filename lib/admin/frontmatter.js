// 프론트매터 원시 함수 — 곡·영화 저장/수정 액션 대부분이 공유한다.

// 본문과 프론트매터를 가르는 정규식: [, fm, body]
export const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

// 프론트매터에서 한 필드 값 추출
export const fmValue = (fm, key) =>
  (fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1] || "").trim();

export const isBlank = (v) => !v || v === "[]";

export const frontmatterValueState = (value) => {
  if (value === null) return "null";
  if (value === "") return "empty";
  if (value === 0 || value === "0") return "zero";
  if (value === undefined) return "missing";
  return "value";
};

const SCHEMAS = {
  song: {
    required: ["title", "artist", "lang"],
    arrays: ["tags", "keywords", "comment_sources"],
    numbers: ["year", "trackId"],
  },
  movie: {
    // media가 없는 오래된 항목은 영화가 기본값이다. title만 저장 필수다.
    required: ["title"],
    arrays: ["tags", "themes"],
    numbers: ["year", "runtime", "rating", "tmdbId"],
  },
};

// parseFrontmatter가 만든 값의 형태만 검사한다. 빈 선택 필드는 허용하지만 null을
// 빈 문자열이나 숫자 0으로 강제 변환하지 않아, 저장 계층의 타입 누수를 드러낸다.
export function validateFrontmatter(meta, kind) {
  const schema = SCHEMAS[kind];
  if (!schema) return [`알 수 없는 kind: ${kind}`];
  const issues = [];
  for (const key of schema.required) {
    if (!Object.hasOwn(meta, key)) issues.push(`${key} 누락`);
    else if (typeof meta[key] !== "string") issues.push(`${key} 문자열 아님 (${frontmatterValueState(meta[key])})`);
    else if (!meta[key].trim()) issues.push(`${key} 빈 문자열`);
  }
  for (const key of schema.arrays) {
    if (Object.hasOwn(meta, key) && !Array.isArray(meta[key])) issues.push(`${key} 배열 아님`);
  }
  for (const key of schema.numbers) {
    if (!Object.hasOwn(meta, key) || meta[key] === "") continue;
    if (meta[key] === null || !/^\d+(?:\.\d+)?$/.test(String(meta[key])))
      issues.push(`${key} 숫자 아님 (${frontmatterValueState(meta[key])})`);
  }
  return issues;
}

export const parseTags = (value = "") =>
  value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

// Replace `key: …` in place, or insert it right after `after:` when absent.
export function setField(raw, key, value, after) {
  const line = `${key}: ${value}`;
  const existing = new RegExp(`^${key}:[ \\t]*.*$`, "m");
  if (existing.test(raw)) return raw.replace(existing, line);
  const anchor = new RegExp(`^(${after}:[ \\t]*.*)$`, "m");
  return anchor.test(raw) ? raw.replace(anchor, `$1\n${line}`) : raw;
}
