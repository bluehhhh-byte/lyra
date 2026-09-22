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
// `Chorus: Ozzy Osbourne & Post Malone` — 구분명 뒤에 참여 크레딧이 붙은 줄.
// 구분만 있는 형태(`Chorus:`)는 아래 화자 규칙이 잡지만, 이름까지 이어진 형태는
// 가사가 아니라 크레딧이다. lib/songs.js의 SECTION_WORD와 같은 어휘로 잡는다.
const SECTION_LABEL = /^(verse|chorus|pre-?chorus|post-?chorus|bridge|intro|outro|hook|refrain|interlude|drop|solo|breakdown|후렴|벌스|브릿지|인트로|아웃트로|간주|훅)(\s+\d+)?\s*[:：]/i;

// 구분명 뒤가 크레딧인가 — 콜론 뒤에서 괄호와 크레딧 어휘(feat., with, prod. …)를
// 치운 뒤 소문자로 시작하는 낱말이 남지 않으면 이름 나열이다. 문장("Chorus: can
// you hear me now")은 소문자가 남아 가사로 살린다. 전부 대문자인 가사에 구분명이
// 붙은 드문 경우는 크레딧으로 읽힌다 — 문서화한 한계.
function isSectionCreditLine(s) {
  const m = SECTION_LABEL.exec(s);
  if (!m) return false;
  const rest = s.slice(m[0].length)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(feat|ft|featuring|prod|produced|by|with)\b\.?/gi, " ");
  return !/(^|[\s"'([{])[a-z]/.test(rest);
}

// 참여 크레딧 — 가사 줄이 이 단어로 시작하는 일은 없다. "with you" 같은 가사는
// 그대로 통과시키기 위해 약어·"featuring"/"produced by"만 본다.
const CREDIT_LEAD = /^(feat|featuring|prod|produced\s+by)\.?\s/i;

export function isNonLyricLine(t) {
  const s = bare(t);
  if (!s) return true;
  if (/^\(?[^()]{1,20}\)?:$/.test(s) && !/[.?!]/.test(s)) return true;
  // [ ]로 감싼 형태도 같은 잣대로 본다 — 24자 넘는 긴 크레딧은 파서가 구간으로
  // 흡수하지 못하고 줄로 남으므로, 벗겨서 판정한다.
  const unwrapped = s.replace(/^\[|\]$/g, "").trim();
  if (isSectionCreditLine(unwrapped)) return true;
  if (CREDIT_LEAD.test(s)) return true;
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
export function needsKo(line, lang) {
  if (line.koMerged || translationTarget(line, lang) !== "ko") return false;
  return !translationFilled("ko", line.ko);
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
  if (line.koMerged || translationTarget(line, lang) !== "en") return false;
  return !translationFilled("en", line.ko);
}

// 이 줄이 기다리는 번역의 방향 — "ko", "en", 또는 없음.
//
// 한 줄에 두 언어가 섞여 있으면 우세한 쪽이 방향을 정한다. 예전에는 needsKo와
// needsEn이 각자 판단해서 섞인 줄에는 둘 다 참이 됐다. 그런데 번역 칸은 줄마다
// 하나뿐이라 어느 방향으로 채우든 그 줄은 "끝난 줄"이 됐다.
//
// 그 틈으로 들어간 것이 한국어→한국어 재작성이다. 아이유 <Dear my crazy soulmate>는
// "다 잊어버려 (Work, hate)"에 "전부 잊어버려 (Work, hate)"가, "그때 널 제일 좋아해"에
// "그때가 널 가장 좋아할 때야"가 붙은 채 검사를 통과하고 있었다 — 번역이 아니라
// 같은 말을 고쳐 쓴 것인데, 칸이 차 있으니 아무도 묻지 않았다.
export function translationTarget(line, lang) {
  const t = (line?.en || "").trim();
  if (!t || isNoteLine(t) || isNonLyricLine(t)) return "";
  // 한국어가 우세한 줄은 영어로 옮긴다. 그 줄의 영어 조각("brand new")은 한국어
  // 독자에게 이미 읽히고, 못 읽는 쪽은 영어 독자다.
  if (isKoreanLine(t)) return lang === "ko" ? "en" : "";
  // 외국어가 우세한 줄은 한국어로. 외국곡 속 한국어 줄은 대개 이미 번역이라 대상이 아니다.
  return hasForeignWord(t) ? "ko" : "";
}

// 번역이 "있다"와 "그 언어로 되어 있다"는 다르다. 칸이 차 있기만 하면 끝난 줄로
// 세던 것이 위 사고의 나머지 절반이다.
//
// 검사는 영어 방향에만 건다. 두 방향이 대칭이 아니기 때문이다:
//   en 방향 — 칸이 한국어면 영어 번역일 수가 없다. 의심의 여지가 없다.
//   ko 방향 — 칸이 라틴이어도 맞을 수 있다. 추임새("Bk, Bk, Bk")·고유명사·
//             굳이 옮기지 않기로 한 후렴이 그렇다. 사람이 이미 정한 것을 다시
//             긁으면 대기열만 늘고 판단은 나아지지 않는다.
// 코퍼스 실측(966곡 29,810줄)으로 이 비대칭을 정했다. 양쪽에 다 걸면 469줄이
// 새로 잡히는데 그중 268줄이 위와 같은 추임새였다.
export function translationFilled(target, text) {
  const t = String(text || "").trim();
  if (!t) return false;
  return target === "en" ? !isKoreanLine(t) : true;
}

// 곡이 실제로 한국어를 싣고 있는가 — 선언된 lang이 아니라 가사를 본다.
//
// 아이유 <Dear my crazy soulmate>는 가사 44줄 중 27줄이 한국어인데 lang: en으로
// 등록돼 있었다. needsEn이 lang === "ko"만 보고 있어서, 한국어 줄에 한국어
// "번역"이 붙은 201줄이 통째로 검사 밖에 있었다. 등록할 때 찍힌 글자 하나가
// 곡 전체를 검사에서 빼는 구조였다.
//
// 기준은 songNeeds가 이미 쓰던 것 그대로다 — 한국어 원문 줄이 셋 이상이면
// 한국어 곡으로 본다. 영어곡에 한 줄 섞인 정도는 여전히 대상이 아니다.
// `line.en`은 파서가 가른 원문이라, 아래에 붙은 `>` 번역은 여기 섞이지 않는다.
export const KOREAN_LINE_FLOOR = 3;
export function carriesKorean(stanzas = []) {
  const korean = stanzas
    .flatMap((stanza) => stanza.lines || [])
    .filter((line) => {
      const t = (line.en || "").trim();
      return t && !isNoteLine(t) && !isNonLyricLine(t) && isKoreanLine(t);
    });
  return korean.length >= KOREAN_LINE_FLOOR;
}

// 곡 단위 판정이 쓸 유효 언어. 선언이 ko면 그대로, 아니어도 가사가 한국어를
// 싣고 있으면 ko로 본다.
export function effectiveLang(song = {}) {
  if (song.lang === "ko") return "ko";
  return carriesKorean(song.stanzas || []) ? "ko" : song.lang;
}

// 사람이 넣은 메타데이터가 "한국 곡"이라고 말하는가 — 무엇을 근거로 그렇게
// 보았는지 함께 돌려준다(아니면 빈 문자열).
//
// carriesKorean만으로 frontmatter의 lang을 고치면 안 된다. 원문 칸에 한국어
// 번역이 잘못 들어간 외국곡이 똑같은 모습이기 때문이다 — Kent <747>,
// Lamp <恋人へ>, The Vines <Country Yard>가 그렇다. 가사가 한국어인 것과
// 사람이 한국 곡이라고 적어 둔 것이 둘 다 맞을 때만 고칠 수 있다.
export function metadataSaysKorean({ tags, artist } = {}) {
  const t = String(tags || "");
  if (/한국/.test(t)) return "tags:한국";
  if (/K-?Pop/i.test(t)) return "tags:K-Pop";
  // 아티스트명을 한글로 적어 둔 곡 — 뱃사공, 에픽하이, 태양
  if (/[가-힣]/.test(String(artist || ""))) return "artist:한글";
  return "";
}

// 방향이 반대로 채워진 줄. 생성 직후 저장 전에 부른다.
//
// translateLyrics의 프롬프트는 이미 "섞인 줄은 우세한 언어로 판단해 줄 전체를
// 옮겨라"라고 적고 있다. 모델이 그걸 지키지 않을 때가 문제였고, 지키지 않아도
// 아무도 묻지 않는 것이 더 문제였다 — 칸이 차 있으니 저장되고, 대기열에서도
// 사라졌다. 판정은 대기열과 같은 규칙을 쓴다(needsEn과 한 몸이다). 그래야
// "저장은 통과했는데 대기열에는 뜬다" 같은 어긋남이 생기지 않는다.
export function wrongDirectionLines(stanzas = [], lang) {
  return stanzas
    .flatMap((stanza) => stanza.lines || [])
    .filter((line) => {
      if (line.koMerged) return false;
      const target = translationTarget(line, lang);
      const text = String(line.ko || "").trim();
      // 비어 있는 줄은 여기 몫이 아니다 — 그건 "아직 안 함"이고 대기열이 본다.
      return Boolean(target) && Boolean(text) && !translationFilled(target, text);
    })
    .map((line) => ({ en: line.en, ko: line.ko, target: translationTarget(line, lang) }));
}

// 독음이 필요한 줄 — 가나·한자가 주가 되는 원문 줄
export const needsReadingLine = (line) => isJaLine(line.en) && !line.reading?.trim();

// Gemini가 한 줄 안에 마커를 붙여 내보내던 사고 흔적
export const hasInlineMarker = (line) => / [>+] /.test(line.en || "");

export function needsLyricSections(song) {
  const yes = (value) => value === true || value === "true";
  if (yes(song.instrumental) || yes(song.lyrics_none)) return false;
  const lyricLines = song.stanzas.flatMap((stanza) => stanza.lines)
    .map((line) => String(line.en || "").trim())
    .filter((line) => line && !isNoteLine(line) && !isNonLyricLine(line));
  // 빈 줄로 연이 이미 나뉜 곡은 구간명이 없어도 읽을 수 있다. 관리자 결손에
  // 올릴 것은 20줄 이상이 한 덩어리로 붙고 후렴까지 반복되는 명백한 경우뿐이다.
  if (lyricLines.length < 20 || song.stanzas.length !== 1 || song.stanzas.some((stanza) => String(stanza.section || "").trim())) return false;
  const normalized = lyricLines.map((line) => line.toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ""));
  return new Set(normalized).size < normalized.length;
}

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
  // 선언된 lang이 아니라 가사가 정한다 — carriesKorean 참조.
  const lang = effectiveLang(s);
  const need = {
    // 가사가 아예 없는 글(연주곡·원문 비공개)의 본문은 해설이다. 해설은 번역하지 않는다.
    translation: instrumental ? 0 : lines.filter((l) => needsKo(l, lang)).length,
    reading: instrumental ? 0 : lines.filter(needsReadingLine).length,
    // 한국 곡의 한국어 줄에 붙일 영어 번역. 한국어 가사가 3줄도 안 되는 곡(영어곡에
    // 한 줄 섞인 정도)은 lang이 ko로 적혀 있어도 대상이 아니다 — 그런 줄까지 세면
    // 대기열이 의미를 잃는다. 하한은 선언과 무관하게 가사로만 본다.
    enTranslation:
      instrumental || lang !== "ko" || !carriesKorean(s.stanzas)
        ? 0
        : lines.filter((l) => needsEn(l, lang)).length,
    inline: lines.filter(hasInlineMarker).length,
    // genre_locked는 사람이 Rock/Pop을 다시 골라 저장했고 Jev가 "이 곡은 정말 더 세분화될 수
    // 없다"고 독립적으로 재확인했을 때만 찍힌다(app/api/admin/songs.js의 genreApply 참조).
    // 이 플래그 없이는 10cc <I'm Not In Love>처럼 정말 순수한 Pop/Rock 곡도 genreApply를
    // 몇 번을 다시 눌러도 매번 "세분화 권장"으로 재판정되어 결손 대기열에서 영원히 못 빠졌다.
    genre: genreIssue(genreTagOf(s.tags), yes(s.genre_locked)) || "",
    keywords: (s.keywords || []).length || instrumental ? 0 : 1,
    emotion: s.emotion || instrumental ? 0 : 1,
    comment: String(s.comment || "").trim() ? 0 : 1,
    titleKo: String(s.title_ko || "").trim() ? 0 : 1,
    artwork: (s.artwork || "").startsWith("https") || s.artwork_none ? 0 : 1,
    year: /^\d{4}$/.test(String(s.year || "")) ? 0 : 1,
    // 가사 없이 해설만 있는 글. 연주곡은 원래 가사가 없으니 세지 않는다
    // (`instrumental: true`로 표시해 두면 매번 '가사 없음'으로 뜨지 않는다)
    lyrics: lyric.length || instrumental ? 0 : 1,
    sections: needsLyricSections(s) ? 1 : 0,
  };
  return need;
}

export function translationStatus(s) {
  const need = songNeeds(s);
  const checkKo = need.translation > 0;
  const checkEn = need.enTranslation > 0;
  const lang = effectiveLang(s);
  let count = 0;
  const stanzas = s.stanzas.map((stanza) => ({
    ...stanza,
    lines: stanza.lines.map((line) => {
      const translationMissing = (checkKo && needsKo(line, lang)) || (checkEn && needsEn(line, lang));
      if (translationMissing) count += 1;
      return translationMissing ? { ...line, translationMissing: true } : line;
    }),
  }));
  return { count, stanzas };
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
  if (n.sections) out.push("가사 구간 검토");
  return out;
};
