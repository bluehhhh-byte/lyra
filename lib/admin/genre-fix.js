// 장르를 한 번에 고친다 — `genre:` 필드와 `tags` 안의 장르 자리를 함께 쓴다.
//
// 두 곳에 나뉘어 있는 것이 반복된 사고의 원인이었다. 결손 판정은 `tags`를 보고
// (genreTagOf), 화면의 '오늘의 기록' 산문은 `genre:` 필드를 읽는다. 한쪽만 고치면
// 화면과 판정이 어긋난 채로 남는다 — 실제로 140곡이 그 상태였다.
import { COUNTRY_TAGS, GENRES, genreIssue, genreTagOf } from "../genre.js";
import { FM, setField } from "./frontmatter.js";

const isYearTag = (tag) => /^\d{4}s?$/.test(tag);
const parseTagList = (value) =>
  String(value || "").replace(/^\[|\]$/g, "").split(",").map((t) => t.trim()).filter(Boolean);
const fieldOf = (fm, key) => (fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m")) || [])[1]?.trim() || "";

// 장르 자리만 갈아 끼운다. 국가·연도 태그의 자리와 순서는 그대로 둔다.
export function withGenreTag(tags, genre) {
  const at = tags.findIndex((t) => !COUNTRY_TAGS.includes(t) && !isYearTag(t));
  if (at >= 0) return tags.map((t, i) => (i === at ? genre : t));
  // 장르 태그가 아예 없던 곡 — 국가 뒤, 연도 앞에 넣는다
  const year = tags.findIndex(isYearTag);
  const next = [...tags];
  next.splice(year >= 0 ? year : next.length, 0, genre);
  return next;
}

// 한 곡의 장르 상태. 화면이 무엇을 고쳐야 하는지 그대로 보여주기 위한 것이다.
export function genreStatus(raw) {
  const m = String(raw || "").replace(/\r\n/g, "\n").match(FM);
  if (!m) return null;
  const tags = parseTagList(fieldOf(m[1], "tags"));
  const tagGenre = genreTagOf(tags);
  const field = fieldOf(m[1], "genre");
  const issue = genreIssue(tagGenre);
  return {
    field,
    tagGenre,
    issue,                                   // 태그 장르 자체의 문제 (없음·비표준·세분화 권장)
    drift: !!(tagGenre && field && tagGenre !== field), // 두 값이 어긋남
  };
}

export function applyGenre(raw, genre) {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const m = text.match(FM);
  if (!m) throw new Error("frontmatter를 읽을 수 없습니다.");
  const next = String(genre || "").trim();
  if (!GENRES.includes(next)) throw new Error(`'${next}'는 장르 어휘에 없습니다.`);

  const tags = withGenreTag(parseTagList(fieldOf(m[1], "tags")), next);
  let out = setField(text, "genre", next, "year");
  out = setField(out, "tags", `[${tags.join(", ")}]`, "year");

  // 본문은 건드리지 않는다 — 프론트매터 두 줄만 바뀌어야 한다.
  if (out.match(FM)?.[2] !== m[2]) throw new Error("본문이 바뀌어 저장을 중단했습니다.");
  return out;
}
