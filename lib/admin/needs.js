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
  // 목록 기호로 시작하는 줄. 캡션에 적어 둔 해설의 소제목(`- 도입부와 자기 선언`)이나
  // 출처 표기(`- Cowboy Bebop, Ending Song`)다. 가사 한 줄은 불릿으로 시작하지 않는다.
  if (/^[-–—•]\s+\S/.test(s)) return true;
  // 캡션에 같이 적어 둔 해설 문단. 가사 한 줄은 이만큼 길지 않고, 길면서 한국어가 주가
  // 되는 줄은 곡 설명·감상문·시나리오 인용이다. 영어를 인용하고 있어도 번역 대상이 아니다.
  // 마침표로 끝나면 더 짧아도 문장이다 — 가사는 줄 끝에 마침표를 찍지 않는다.
  const limit = /[.]$/.test(s) ? 40 : 60;
  if (s.length > limit) {
    const ko = (s.match(/[가-힣]/g) || []).length;
    const en = (s.match(/[A-Za-z]/g) || []).length;
    if (ko && ko / (ko + en) >= 0.4) return true;
  }
  if (!/[a-zA-Z가-힣ぁ-んァ-ン一-龯]/.test(s)) return true;
  return false;
}

// 한국어로 옮길 말이 남아 있는가 — 낱말이 될 만한 라틴 글자, 또는 가나·한자.
// 감탄사("Oh", "Yeah")도 라틴 낱말이라 여기 걸린다. 조용히 빼지 않는다 —
// 음역하든 그대로 두든 사람이 정하고, 정할 때까지는 누락으로 남는 게 맞다.
const hasForeignWord = (t) => /[A-Za-z]{2,}/.test(t) || /[ぁ-んァ-ヶー一-鿿]/.test(t);

// 한글 번역이 필요한 줄인가.
//
// 곡의 lang이 아니라 그 줄에 무엇이 적혀 있는지로 판단한다. 예전에는 `lang: ko`면
// 무조건 번역 대상이 아니라고 봤는데, 한국 곡에도 영어로만 된 줄이 많다("Real love?",
// "You & me"). 그 줄들이 통째로 검사에서 빠져 '번역 누락 0줄'이라는 잘못된 보고가 났다.
// 한영을 섞어 쓴 줄도 영어 뜻이 남아 있으면 옮길 말이 남은 것이다.
//
// 한국어만 있는 줄에는 번역을 만들지 않는다 — 옮길 말이 없다.
export function needsKo(line) {
  const t = (line.en || "").trim();
  if (!t || line.ko?.trim() || line.koMerged) return false;
  if (isNoteLine(t) || isNonLyricLine(t)) return false;
  return hasForeignWord(t);
}

// 한국어가 주가 되는 줄인가 — 로마자가 섞여 있어도 한글이 중심이면 참이다.
// 글자 수를 그대로 견주지 않는다: 한글은 한 음절이 한 글자, 영어는 한 낱말이 대여섯 글자다.
const isKoreanLine = (t) => {
  const s = String(t || "").trim();
  if (!s) return false;
  const ko = (s.match(/[가-힣]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;
  return ko > 0 && ko * 2.5 >= en;
};

// 영어 번역이 필요한 줄인가 — 한국 곡의 한국어 가사 줄에는 영어 번역을 붙인다.
//
// needsKo와 방향이 반대다. needsKo는 "한국어로 옮길 말이 남았는가"를 보고, 이건
// "한국어 줄에 영어가 붙어 있는가"를 본다. 둘 다 필요하다 — 한국 곡에는 두 종류의
// 줄이 섞여 있고, 각각 반대 방향의 번역을 기다린다.
//
// 이 판정이 없어서 PIA <Storm Is Coming>은 영어 줄에만 번역이 붙고 한국어 줄은 비어
// 있는 채로 오래 남아 있었다. 검사에서 걸리지 않으니 사람 눈에 띌 때까지 몰랐다.
export function needsEn(line, lang) {
  if (lang !== "ko") return false;
  const t = (line.en || "").trim();
  if (!t || line.ko?.trim() || line.koMerged) return false;
  if (isNoteLine(t) || isNonLyricLine(t)) return false;
  return isKoreanLine(t);
}

// 독음이 필요한 줄 — 가나·한자가 주가 되는 원문 줄
export const needsReadingLine = (line) => isJaLine(line.en) && !line.reading?.trim();

// Gemini가 한 줄 안에 마커를 붙여 내보내던 사고 흔적
export const hasInlineMarker = (line) => / [>+] /.test(line.en || "");

// 곡 하나의 부족한 항목 — 화면·린트·대량 작업 계획이 모두 이걸 쓴다
export function songNeeds(s) {
  const lines = s.stanzas.flatMap((st) => st.lines);
  const lyric = lines.filter((l) => (l.en || "").trim() && !isNoteLine(l.en) && !isNonLyricLine(l.en));
  // 키워드·감정은 가사에서 뽑는다. 뽑을 가사가 없는 곡은 영원히 채울 수 없는 항목으로
  // 대기열에 남으므로 세지 않는다. 두 경우다:
  //   instrumental  연주곡 — 원래 가사가 없다
  //   lyrics_none   어디에도 원문이 공개돼 있지 않은 곡 — 이유는 lyrics_note에 적는다
  const yes = (v) => v === true || v === "true";
  const instrumental = yes(s.instrumental) || yes(s.lyrics_none);
  const need = {
    // 가사가 아예 없는 글(연주곡·원문 비공개)의 본문은 해설이다. 해설은 번역하지 않는다.
    translation: instrumental ? 0 : lines.filter((l) => needsKo(l, s.lang)).length,
    reading: instrumental ? 0 : lines.filter(needsReadingLine).length,
    // 한국 곡의 한국어 줄에 붙일 영어 번역. 한국어 가사가 3줄도 안 되는 곡(영어곡에
    // 한 줄 섞인 정도)은 대상이 아니다 — 그런 줄까지 세면 대기열이 의미를 잃는다.
    enTranslation:
      instrumental || s.lang !== "ko" || lines.filter((l) => isKoreanLine(l.en) && !isNoteLine(l.en) && !isNonLyricLine(l.en)).length < 3
        ? 0
        : lines.filter((l) => needsEn(l, s.lang)).length,
    inline: lines.filter(hasInlineMarker).length,
    genre: genreIssue(genreTagOf(s.tags)) || "",
    keywords: (s.keywords || []).length || instrumental ? 0 : 1,
    emotion: s.emotion || instrumental ? 0 : 1,
    comment: String(s.comment || "").trim() ? 0 : 1,
    titleKo: String(s.title_ko || "").trim() ? 0 : 1,
    artwork: (s.artwork || "").startsWith("https") || s.artwork_none ? 0 : 1,
    year: /^\d{4}$/.test(String(s.year || "")) ? 0 : 1,
    // 가사 없이 해설만 있는 글. 연주곡은 원래 가사가 없으니 세지 않는다
    // (`instrumental: true`로 표시해 두면 매번 '가사 없음'으로 뜨지 않는다)
    lyrics: lyric.length || instrumental ? 0 : 1,
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
  if (n.enTranslation) out.push(`영어 번역 없음 ${n.enTranslation}줄`);
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
