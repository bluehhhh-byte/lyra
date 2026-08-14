// 곡에 무엇이 빠졌는지 판정하는 한 곳.
//
// 같은 질문을 세 군데서 서로 다르게 답하고 있었다 — 관리자 형식검사, scripts/lint-data,
// 대량 작업 계획. 그래서 파서를 고쳐 해결된 것(병합 번역·해설 줄·외국곡 속 한국어 줄)이
// 관리자 화면에는 계속 "번역 없음"으로 뜨고, 214곡을 고치라는 잘못된 지시가 나왔다.
// 판정은 여기서만 한다.
import { isJaLine } from "./song-meta.js";
import { genreTagOf, genreIssue } from "../genre.js";

export const isNoteLine = (t) => /^[🗨✏]/u.test((t || "").trim());

// 눈에 안 보이는 문자(제로폭 공백·BOM·NBSP)만 있는 줄은 빈 줄이다.
// 인스타 캡션에는 이런 줄이 흔한데, 그냥 두면 "번역 없는 줄"로 잡힌다.
const bare = (t) => String(t || "").replace(/[​-‍﻿]/g, "").replace(/ /g, " ").trim();

// 가사가 아닌 줄 — 원문에 섞여 있지만 번역할 대상이 아니다.
//   `(Michael):` `(Both):`   듀엣 곡의 화자 표시
//   `2. Sonic Youth - Stones (2004)`  캡션에 같이 적어 둔 관련곡 목록
//   `1, 2, 3, 4`             숫자 카운트 (글자가 하나도 없는 줄)
export function isNonLyricLine(t) {
  const s = bare(t);
  if (!s) return true;
  if (/^\(?[^()]{1,20}\)?:$/.test(s) && !/[.?!]/.test(s)) return true;
  if (/^\d+\.\s+.+\s[-–—]\s.+$/.test(s)) return true;
  if (!/[a-zA-Z가-힣ぁ-んァ-ン一-龯]/.test(s)) return true;
  return false;
}

// 한글 번역이 필요한 줄인가 — 한국어 곡의 원문, 해설, 이미 한글인 줄은 아니다.
// 한영을 한 줄에 섞어 쓰는 K-pop("불을 붙여 brand new")은 이미 한국어로 읽힌다.
// 예전에는 라틴 글자 수와 한글 수를 비교해서 이런 줄을 번역 대상으로 봤는데,
// 그러면 붙일 수 있는 번역이 원문과 거의 같아진다 — 한글이 두 자만 있어도 넘어간다.
export function needsKo(line, lang) {
  const t = (line.en || "").trim();
  if (!t || line.ko?.trim() || line.koMerged) return false;
  if (isNoteLine(t) || isNonLyricLine(t)) return false;
  if (lang === "ko") return false; // ko 곡의 `>`는 영어 번역이라 별도 기준
  return (t.match(/[가-힣]/g) || []).length < 2;
}

// 독음이 필요한 줄 — 가나·한자가 주가 되는 원문 줄
export const needsReadingLine = (line) => isJaLine(line.en) && !line.reading?.trim();

// Gemini가 한 줄 안에 마커를 붙여 내보내던 사고 흔적
export const hasInlineMarker = (line) => / [>+] /.test(line.en || "");

// 곡 하나의 부족한 항목 — 화면·린트·대량 작업 계획이 모두 이걸 쓴다
export function songNeeds(s) {
  const lines = s.stanzas.flatMap((st) => st.lines);
  const lyric = lines.filter((l) => (l.en || "").trim() && !isNoteLine(l.en) && !isNonLyricLine(l.en));
  const need = {
    translation: lines.filter((l) => needsKo(l, s.lang)).length,
    reading: lines.filter(needsReadingLine).length,
    inline: lines.filter(hasInlineMarker).length,
    genre: genreIssue(genreTagOf(s.tags)) || "",
    keywords: (s.keywords || []).length ? 0 : 1,
    emotion: s.emotion ? 0 : 1,
    comment: String(s.comment || "").trim() ? 0 : 1,
    titleKo: String(s.title_ko || "").trim() ? 0 : 1,
    artwork: (s.artwork || "").startsWith("https") || s.artwork_none ? 0 : 1,
    year: /^\d{4}$/.test(String(s.year || "")) ? 0 : 1,
    // 가사 없이 해설만 있는 글. 연주곡은 원래 가사가 없으니 세지 않는다
    // (`instrumental: true`로 표시해 두면 매번 '가사 없음'으로 뜨지 않는다)
    lyrics: lyric.length || s.instrumental === "true" || s.instrumental === true ? 0 : 1,
  };
  return need;
}

// 키워드가 가사에 실제로 나오는지 — 근거 없는 키워드는 화면의 `#`칩이 헛돈다.
// 다만 한국어 텍스트 자체가 짧은 곡(4줄짜리 발췌, 후렴만 있는 곡)은 뽑을 단어가
// 없어서 늘 걸린다. 그런 곡은 판정하지 않는다.
export function keywordsUngrounded(s) {
  const kws = s.keywords || [];
  if (!kws.length) return false;
  const text = s.stanzas.flatMap((st) => st.lines).map((l) => `${l.en || ""} ${l.ko || ""}`).join(" ");
  const korean = (text.match(/[가-힣]/g) || []).length;
  if (korean < 60) return false; // 뽑아 쓸 한국어가 애초에 없다
  return kws.filter((k) => !text.includes(k)).length >= Math.ceil(kws.length * 0.6);
}

export const summarizeNeeds = (s) => {
  const n = songNeeds(s);
  const out = [];
  if (n.inline) out.push(`인라인 마커 ${n.inline}줄`);
  if (n.translation) out.push(`번역 없음 ${n.translation}줄`);
  if (n.reading) out.push(`독음 없음 ${n.reading}줄`);
  if (n.genre) out.push(`장르: ${n.genre}`);
  if (n.keywords) out.push("키워드 없음");
  if (n.emotion) out.push("감정 없음");
  if (n.comment) out.push("코멘트 없음");
  if (n.titleKo) out.push("한글 제목 없음");
  if (n.artwork) out.push("커버 없음");
  if (n.year) out.push("연도 없음");
  if (n.lyrics) out.push("가사 없음");
  return out;
};
