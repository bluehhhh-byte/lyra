// 가사 교정 이력 — 인스타 원본과 달라진 줄의 근거를 남긴다.
//
// 무손실 검증(scripts/verify-instagram.mjs)은 "인스타에 적힌 그대로냐"만 본다.
// 인스타에 처음부터 오타·잘못 들은 단어가 있었으면 그건 잡히지 않는다. 그걸 고치면
// 이번엔 무손실 검증이 깨진다 — 그래서 source_hash는 계속 인스타 원본을 가리키게 두고,
// 달라진 줄은 여기에 근거와 함께 기록한다. 검증기는 '승인된 교정'만 차이로 허용하고,
// 기록 없는 원문 변경은 오류로 남긴다.
import crypto from "crypto";

export const FILE = "data/lyrics-corrections.json";

// 눈에 안 보이는 문자(제로폭 공백·BOM·NBSP)와 앞뒤 공백은 내용이 아니다.
// 정규화해서 해시해야 파일에서 읽은 줄과 캡션에서 읽은 줄이 같은 값이 된다.
const normLine = (s) => String(s ?? "").replace(/[​-‍﻿]/g, "").replace(/ /g, " ").trim();
export const lineHash = (s) => crypto.createHash("sha1").update(normLine(s)).digest("hex").slice(0, 12);

// 교정 종류 — 감사 화면의 분류와 같은 어휘를 쓴다
export const TYPES = [
  "original_typo",      // 원문 오타·잘못 들은 단어
  "original_missing",   // 빠진 구절
  "original_duplicate", // 중복된 구절
  "line_split",         // 줄 분리·병합
  "version_mismatch",   // 라이브·리믹스 등 다른 버전 가사
  "translation_wrong",  // 번역이 원문 의미와 다름
  "translation_added",  // 번역이 원문에 없는 말을 더함
  "translation_missing",// 병합 번역에서 빠진 의미
  "caption_leak",       // 캡션 설명·연도·해시태그가 가사로 들어옴
];

const EMPTY = { items: [], at: "" };

export function load(readFile) {
  try {
    const j = JSON.parse(readFile(FILE));
    return { items: Array.isArray(j.items) ? j.items : [], at: j.at || "" };
  } catch {
    return { ...EMPTY, items: [] };
  }
}

// 한 줄에 대한 교정 1건. before/after는 원문 그대로가 아니라 해시만 남긴다 —
// 외부 가사를 통째로 복제해 두지 않기 위해서다(비교 목적으로만 쓴다).
export function makeEntry({ slug, type, lineIndex, before, after, reason, sourceUrl, field = "original" }) {
  if (!slug) throw new Error("slug 필요");
  if (!TYPES.includes(type)) throw new Error(`type이 목록 밖: ${type}`);
  if (!reason?.trim()) throw new Error("reason 필요 — 근거 없는 수정은 남기지 않는다");
  return {
    slug,
    type,
    field,                       // original | translation
    lineIndex: Number(lineIndex),
    beforeHash: lineHash(before),
    afterHash: lineHash(after),
    reason: reason.trim(),
    sourceUrl: (sourceUrl || "").trim(),
    reviewedAt: new Date().toISOString(),
  };
}

// 이 줄이 승인된 교정인지 — 검증기가 인스타 원본과 다른 줄을 만났을 때 묻는다
export function isApproved(items, slug, beforeText, afterText) {
  const b = lineHash(beforeText), a = lineHash(afterText);
  return items.some((i) => i.slug === slug && i.beforeHash === b && i.afterHash === a);
}

export const bySlug = (items) => {
  const m = new Map();
  for (const i of items) m.set(i.slug, [...(m.get(i.slug) || []), i]);
  return m;
};
