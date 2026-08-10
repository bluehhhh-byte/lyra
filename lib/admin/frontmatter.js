// 프론트매터 원시 함수 — 곡·영화 저장/수정 액션 대부분이 공유한다.

// 본문과 프론트매터를 가르는 정규식: [, fm, body]
export const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

// 프론트매터에서 한 필드 값 추출
export const fmValue = (fm, key) =>
  (fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1] || "").trim();

export const isBlank = (v) => !v || v === "[]";

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
