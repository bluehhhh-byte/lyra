// lang 메타가 실제 가사와 맞는지 본다 — `node scripts/lang-audit.mjs`
//
// lang은 곡 화면의 표기와 대량 작업 계획이 함께 쓴다. 한국 곡이 `en`으로 적혀 있으면
// 번역·독음 판정이 통째로 어긋난다. 원문 줄의 글자 종류만 세서 어긋난 곡을 나열한다.
// 고치는 건 사람이 한다 — 발췌만 실린 곡은 실제로 애매할 수 있다.
import { getAllSongs } from "../lib/songs.js";
import { isNoteLine, isNonLyricLine } from "../lib/admin/needs.js";

const bad = [];
for (const s of getAllSongs()) {
  const text = s.stanzas
    .flatMap((st) => st.lines)
    // 인스타 캡션 일부는 `원문<U+2028>번역`으로 한 줄에 붙어 있다. 뒤쪽은 번역이므로 뗀다.
    .map((l) => (l.en || "").split(/[\u2028\u2029]/)[0])
    // 본문에 섞인 해설 문단은 가사가 아니다. 가사 한 줄은 이만큼 길지 않다.
    .filter((t) => t.trim().length <= 60 && !isNoteLine(t) && !isNonLyricLine(t))
    .join(" ");
  // 글자 수를 그대로 견주면 안 된다 — 한글은 한 음절이 한 글자, 영어는 한 낱말이 대여섯
  // 글자다. 한 음절이 영어 두어 글자에 해당한다고 보고 무게를 맞춘다.
  const ko = (text.match(/[가-힣]/g) || []).length * 2.5;
  const ja = (text.match(/[ぁ-んァ-ヶ]/g) || []).length * 2.5;
  const en = (text.match(/[A-Za-z]/g) || []).length;
  const all = ko + ja + en;
  if (all < 80) continue; // 발췌만 실린 곡은 판정하지 않는다
  const actual = ja / all > 0.2 ? "ja" : ko / all > 0.5 ? "ko" : en / all > 0.7 ? "en" : "";
  if (actual && s.lang && actual !== s.lang) {
    bad.push(`${s.slug}: lang=${s.lang} · 실제 ${actual} (한 ${ko} · 가나 ${ja} · 영 ${en})`);
  }
}
console.log(bad.join("\n") || "lang 어긋난 곡 없음");
console.log(`\n어긋남 ${bad.length}곡`);
