// 무엇이 '부족한' 줄인지 판정하는 규칙 — 화면·린트·자동수정이 같은 답을 내야 한다.
// 이 규칙이 어긋나서 실제로 두 번 사고가 났다:
//  1) 관리자 형식검사가 이미 해결된 줄까지 세어 214곡을 고치라고 했다
//  2) 자동수정이 🗨 해설을 가사로 보고 번역을 붙였고, `>^N`이 덮은 줄에 번역을
//     또 붙여 범위가 어긋났다
//   node lib/needs.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseLyrics } from "./songs.js";
import {
  needsKo, needsEn, needsReadingLine, isNoteLine, songNeeds, translationStatus,
  translationTarget, translationFilled, wrongDirectionLines, effectiveLang, KOREAN_LINE_FLOOR, metadataSaysKorean,
} from "./admin/needs.js";
import { FM, fmValue } from "./admin/frontmatter.js";

const song = (body, extra = {}) => ({ stanzas: parseLyrics(body), tags: [], keywords: ["밤"], emotion: "고독", comment: "c", title_ko: "t", artwork: "https://x/y.jpg", year: "2020", ...extra });

// 해설 줄은 가사가 아니다 — 번역 대상도, 독음 대상도 아니다
{
  assert.ok(isNoteLine("🗨 이 곡은 …"));
  assert.ok(isNoteLine("✏ 메모"));
  const [st] = parseLyrics("🗨 이 곡에 대한 해설");
  assert.equal(st.lines.length, 0, "해설은 가사 줄로 세지 않는다");
  assert.ok(st.note, "해설은 연 노트로 간다");
}

// `>^N`이 덮은 줄은 번역이 없는 게 아니다
{
  const [st] = parseLyrics("A line\nAnother line\n>^2 두 줄을 한 번에 옮긴 번역");
  assert.equal(needsKo(st.lines[0], "en"), false, "덮인 줄은 번역 대상이 아니다");
  assert.equal(needsKo(st.lines[1], "en"), false);
}

// 외국곡 안의 한국어 가사에 한글 번역을 붙일 이유가 없다
{
  const [st] = parseLyrics("우리 함께 걸었던 길");
  assert.equal(needsKo(st.lines[0], "en"), false, "이미 한글인 줄은 번역 대상이 아니다");
}

// 진짜 빠진 줄은 잡는다
{
  const [st] = parseLyrics("A line with no translation");
  assert.equal(needsKo(st.lines[0], "en"), true);
}

// 판정은 한 곳에서만 한다 — 관리자 진단·needs-work·lint가 같은 함수를 쓴다.
// 예전에는 lint가 규칙을 따로 복사해 갖고 있어 화면과 숫자가 갈렸다.
{
  const lint = fs.readFileSync(new URL("../scripts/lint-data.mjs", import.meta.url), "utf8");
  const needsWork = fs.readFileSync(new URL("../scripts/needs-work.mjs", import.meta.url), "utf8");
  const admin = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
  assert.ok(/from "\.\.\/lib\/admin\/needs\.js"/.test(lint), "lint-data가 needs.js를 쓰지 않는다");
  assert.ok(/admin\/needs/.test(needsWork), "needs-work가 needs.js를 쓰지 않는다");
  assert.ok(/admin\/needs/.test(admin), "관리자 API가 needs.js를 쓰지 않는다");
  assert.ok(!/\[가-힣\]\/g\)\s*\|\|\s*\[\]\)\.length/.test(lint), "lint에 판정 규칙이 복사돼 있다");
}

// 판단 기준은 곡의 lang이 아니라 그 줄에 무엇이 적혀 있는가다.
// 한국 곡에도 영어로만 된 줄이 있고, 거기엔 한국어 번역이 붙어야 한다.
{
  const [en] = parseLyrics("Real love?");
  assert.equal(needsKo(en.lines[0], "ko"), true, "ko 곡의 영어 전용 줄 — 번역 필요");

  const [done] = parseLyrics("Real love?\n> 진짜 사랑일까?");
  assert.equal(needsKo(done.lines[0], "ko"), false, "번역이 붙어 있으면 정상");

  // 한영 혼합 줄의 방향은 우세한 쪽이 정한다. "불을 붙여 brand new"는 한국어가
  // 주라 영어로 옮긴다 — 예전에는 needsKo·needsEn이 둘 다 참이었고, 번역 칸은
  // 하나뿐이라 어느 쪽으로 채워도 끝난 줄이 됐다. 한국어로 채우면
  // "불을 붙여 새롭게" 같은 한국어→한국어 재작성이 되는데 그게 그대로 통과했다.
  const [mixed] = parseLyrics("불을 붙여 brand new");
  assert.equal(needsKo(mixed.lines[0], "ko"), false, "한국어가 주인 줄은 한국어 번역 대상이 아니다");
  assert.equal(needsEn(mixed.lines[0], "ko"), true, "영어로 옮길 줄이다");
  assert.equal(translationTarget(mixed.lines[0], "ko"), "en");

  // 반대로 영어가 주인 혼합 줄은 한국어 방향이다
  const [enMixed] = parseLyrics("짙은 향기 속 I feel so drowned");
  assert.equal(translationTarget(enMixed.lines[0], "ko"), "ko");
  assert.equal(needsEn(enMixed.lines[0], "ko"), false, "두 방향이 동시에 참일 수 없다");

  const [koOnly] = parseLyrics("우리 함께 걸었던 길");
  assert.equal(needsKo(koOnly.lines[0], "ko"), false, "한국어만 있는 줄 — 옮길 말이 없다");
  assert.equal(needsKo(koOnly.lines[0], "en"), false, "외국곡 속 한국어 줄도 마찬가지");

  // 감탄사·고유명사도 라틴 낱말이라 대상이다 — 조용히 빠지면 안 된다
  for (const t of ["Oh", "Yeah, yeah", "Woo"]) {
    const [st] = parseLyrics(t);
    assert.equal(needsKo(st.lines[0], "ko"), true, `감탄사도 검사에 남는다: ${t}`);
  }
}

// 가사가 아닌 줄 — 화자 표시, 캡션에 같이 적은 관련곡 목록, 숫자 카운트
{
  for (const t of ["(Michael):", "(Both):", "News Man):", "2. Sonic Youth - Stones (2004)",
                   "3. Astor Piazzolla - Oblivion (perf. 조윤경)", "1, 2, 3, 4", "​"]) {
    const [st] = parseLyrics(t);
    if (!st?.lines.length) continue; // 빈 줄로 걸러졌으면 그것대로 맞다
    assert.equal(needsKo(st.lines[0], "en"), false, `가사 아님: ${JSON.stringify(t)}`);
  }
  // 구분명 + 참여 크레딧 — "Chorus: Ozzy Osbourne & Post Malone"은 가사가 아니라
  // 크레딧이다. 이름이 콜론 뒤에 이어져도 화자 표시 규칙이 잡지 못해 번역 대기열을
  // 영원히 막고 있었다.
  for (const t of ["Chorus: Ozzy Osbourne & Post Malone", "[Chorus: Ozzy Osbourne & Post Malone]",
                   "Verse 2: 태연 & Paolo Nutini", "Hook: IU (feat. DPR LIVE)", "feat. Park Hyo-shin"]) {
    const [st] = parseLyrics(t);
    if (!st?.lines.length) continue; // [ ]는 파서가 구간으로 흡수한다 — 그것대로 맞다
    assert.equal(needsKo(st.lines[0], "en"), false, `크레딧 줄은 번역 대상이 아니다: ${t}`);
  }
  // 구분명 뒤에 진짜 문장이 오면 여전히 가사다
  const [cue] = parseLyrics("Chorus: can you hear me now");
  assert.equal(needsKo(cue.lines[0], "en"), true, "구분명 뒤의 문장은 가사다");
  // 진짜 가사인데 콜론으로 끝나는 줄까지 삼키면 안 된다
  const [st] = parseLyrics("And then she said to me:");
  assert.equal(needsKo(st.lines[0], "en"), true, "문장은 화자 표시가 아니다");
}

// 캡션에 같이 적어 둔 해설 문단 — 영어를 인용하고 있어도 번역 대상이 아니다.
// 지드래곤 POWER 글은 가사 대신 곡 해설만 실려 있는데, 인용된 영어 때문에 계속 '번역 없음'으로 떴다.
{
  const prose = "•“Now I got the power”라는 후렴구는 단순한 힘이 아닌 문화적 영향력을 의미합니다. “King is still poppin’“은 그의 영향력을 표현합니다.";
  const [st] = parseLyrics(prose);
  assert.equal(needsKo(st.lines[0], "ko"), false, "해설 문단은 번역 대상이 아니다");
  // 길지만 한국어가 주가 아닌 줄(긴 영어 가사)까지 삼키면 안 된다
  const [long] = parseLyrics("I have been waiting for this moment all my life and I will not let it go now");
  assert.equal(needsKo(long.lines[0], "ko"), true, "긴 영어 가사는 그대로 번역 대상이다");
}

// 해설의 소제목과 출처 표기 — 불릿으로 시작하는 줄은 가사가 아니다.
{
  const [bullet] = parseLyrics("- 도입부와 자기 선언");
  assert.equal(needsEn(bullet.lines[0], "ko"), false, "불릿 소제목은 번역 대상이 아니다");
  const [src] = parseLyrics("- Cowboy Bebop, Ending Song");
  assert.equal(needsKo(src.lines[0], "ko"), false, "불릿 출처 표기도 마찬가지다");
  // 가사에 붙는 대시(장음 표시·이어 부르기)까지 삼키면 안 된다
  const [dash] = parseLyrics("-- 아무도 없어");
  assert.equal(needsEn(dash.lines[0], "ko"), true, "붙여 쓴 기호는 목록이 아니다");
}

// 마침표로 끝나는 한국어 문장 — 60자에 못 미쳐도 해설이다. 가사는 줄 끝에 마침표를 찍지 않는다.
{
  const s = "이 곡은 자신의 영향력과 성공, 그리고 비판에 대한 초연한 태도를 표현한 트랙입니다.";
  const [prose] = parseLyrics(s);
  assert.equal(needsEn(prose.lines[0], "ko"), false, "마침표로 끝나는 긴 문장은 해설이다");
  const [lyric] = parseLyrics("네가 없는 또 하루 해질 무렵에 나는 아무것도 하지 못하고");
  assert.equal(needsEn(lyric.lines[0], "ko"), true, "마침표 없는 긴 가사 줄은 그대로 대상이다");
}
console.log("✓ 한영 혼용·비가사 줄 제외");

// 원문보다 번역이 많은 문단 — 어느 번역도 화면에서 사라지면 안 된다.
// 예전에는 자리가 모자란 번역이 마지막 줄을 덮어써서, 원문 두 줄을 세 줄로 옮긴 곳의
// 앞 번역이 통째로 없어졌다(66곡 222줄).
{
  const [st] = parseLyrics("Line one\nLine two\n> 첫 줄 번역\n> 둘째 줄 번역\n> 남는 번역");
  const shown = st.lines.map((l) => l.ko).join(" ");
  for (const t of ["첫 줄 번역", "둘째 줄 번역", "남는 번역"])
    assert.ok(shown.includes(t), `번역이 사라짐: ${t}`);
}

// `>^N`이 문단 줄 수보다 크게 잡혀도 앞선 번역을 잃지 않는다
{
  const [st] = parseLyrics("A\nB\nC\n>^3 첫 번역\n> 둘째 번역\n> 셋째 번역");
  const shown = st.lines.map((l) => l.ko).join(" ");
  for (const t of ["첫 번역", "둘째 번역", "셋째 번역"])
    assert.ok(shown.includes(t), `번역이 사라짐: ${t}`);
}
console.log("✓ 번역은 어떤 경우에도 사라지지 않는다");

// 독음은 일본어 줄에만, 이미 있으면 아니다
{
  const [st] = parseLyrics("夜に駆ける\n街の灯り\n+ 마치노 아카리");
  assert.equal(needsReadingLine(st.lines[0]), true);
  assert.equal(needsReadingLine(st.lines[1]), false, "이미 독음이 있으면 대상이 아니다");
}
console.log("✓ 번역·독음·해설 판정");

// 곡 단위 집계 — 해설만 있는 글은 '가사 없음'으로 잡힌다
{
  const n = songNeeds(song("🗨 가사 없이 해설만 적은 글"));
  assert.equal(n.lyrics, 1);
  assert.equal(n.translation, 0, "해설을 번역 대상으로 세지 않는다");
}
{
  const n = songNeeds(song("Line one\n> 한 줄 번역", { lang: "en" }));
  assert.equal(n.translation, 0);
  assert.equal(n.lyrics, 0);
}
// 연주곡은 가사에서 뽑을 게 없다 — 가사·키워드·감정을 대기열에 올리지 않는다
{
  const n = songNeeds(song("🗨 연주곡 해설", { instrumental: true, keywords: [], emotion: "" }));
  assert.equal(n.lyrics, 0);
  assert.equal(n.keywords, 0);
  assert.equal(n.emotion, 0);
  const m = songNeeds(song("🗨 가사 미기입", { keywords: [], emotion: "" }));
  assert.equal(m.lyrics, 1, "연주곡이 아니면 그대로 잡힌다");
  assert.equal(m.keywords, 1);
  // 원문이 어디에도 공개되지 않은 곡도 마찬가지 — 채울 수 없는 항목을 대기열에 두지 않는다
  const k = songNeeds(song("🗨 원문 없음", { lyrics_none: "true", keywords: [], emotion: "" }));
  assert.equal(k.lyrics, 0);
  assert.equal(k.keywords, 0);
  assert.equal(k.emotion, 0);
}
// 한국 곡의 한국어 줄에는 영어 번역이 붙어야 한다 — needsKo와 방향이 반대다.
// 이 판정이 없어서 PIA <Storm Is Coming>이 영어 줄에만 번역이 붙은 채 오래 남아 있었다.
{
  const [ko] = parseLyrics("마치 아름다운 꿈을 꾸는 듯해");
  assert.equal(needsEn(ko.lines[0], "ko"), true, "한국 곡의 한국어 줄 — 영어 번역 필요");

  const [done] = parseLyrics("마치 아름다운 꿈을 꾸는 듯해\n> It feels like dreaming");
  assert.equal(needsEn(done.lines[0], "ko"), false, "번역이 붙어 있으면 정상");

  const [en] = parseLyrics("Show is over");
  assert.equal(needsEn(en.lines[0], "ko"), false, "영어 줄은 이쪽 대상이 아니다 — needsKo가 본다");

  // 외국곡 속 한국어 줄은 대개 번역이라 대상이 아니다
  const [foreign] = parseLyrics("우리 함께 걸었던 길");
  assert.equal(needsEn(foreign.lines[0], "en"), false, "ko 곡이 아니면 세지 않는다");
  assert.equal(needsEn(foreign.lines[0], "ja"), false);

  // 한영 혼합이라도 한국어가 주가 되면 대상이다
  const [mixed] = parseLyrics("네게 돌이킬 수 없는 그 날이 오네 yeah");
  assert.equal(needsEn(mixed.lines[0], "ko"), true, "한국어가 주가 되는 줄");
}

// 곡 단위 — 한국어 가사가 3줄도 안 되는 곡은 대기열에 올리지 않는다.
// 영어곡에 한국어 한 줄이 섞인 정도까지 세면 대기열이 의미를 잃는다.
{
  const body = "그 날이 오네\n마지막 노랫소리로\n몰아치는 혼돈은";
  assert.equal(songNeeds(song(body, { lang: "ko" })).enTranslation, 3, "한국어 3줄이면 전부 대상");
  assert.equal(
    songNeeds(song("Show is over\n> 쇼는 끝났어\n그 날이 오네", { lang: "ko" })).enTranslation,
    0,
    "한국어 줄이 3줄 미만이면 세지 않는다"
  );
  // "외국곡은 대상이 아니다"의 근거는 선언이 아니라 가사다. 이 픽스처는 한국어
  // 세 줄이라 lang을 en으로 적어도 한국 곡이다 — 아이유 <Dear my crazy soulmate>가
  // 정확히 이 상태(한국어 가사 27줄 + lang: en)로 검사 밖에 있었다.
  assert.equal(songNeeds(song(body, { lang: "en" })).enTranslation, 3, "lang 오기입이 곡을 가리지 못한다");
  // 진짜 외국곡 — 원문이 영어고 한국어는 번역 칸에 있다
  const foreign = "I walked alone\n> 혼자 걸었어\nThe night was long\n> 밤은 길었어\nNo one came\n> 아무도 오지 않았어";
  assert.equal(songNeeds(song(foreign, { lang: "en" })).enTranslation, 0, "외국곡은 대상이 아니다");
  assert.equal(songNeeds(song(body, { lang: "ko", instrumental: true })).enTranslation, 0, "연주곡은 세지 않는다");
}
console.log("✓ 한국 곡의 영어 번역 누락 판정");

console.log("✓ 곡 단위 집계");

console.log("all passed");

// 관리자가 "가사 없이 등록"으로 저장한 글 — API가 찍는 frontmatter 모양 그대로.
// 데이터 모델은 처음부터 lyrics_none을 읽었지만 화면에 그 표시를 세울 길이 없어서,
// 원문을 못 구한 곡은 등록조차 되지 않았다. 이제 저장되므로 그 모양을 고정한다.
{
  const md = [
    "---",
    "title: Test Song",
    "artist: Someone",
    "lang: en",
    "comment: 원문을 못 구한 곡이다",
    "lyrics_none: true",
    "lyrics_note: 어디에도 가사가 공개되지 않음",
    "---",
    "",
    "",
  ].join(String.fromCharCode(10));

  const m = md.match(FM);
  assert.ok(m, "가사 없이 저장한 글도 frontmatter가 읽혀야 한다");
  assert.equal(fmValue(m[1], "lyrics_none"), "true");
  assert.equal(fmValue(m[1], "lyrics_note"), "어디에도 가사가 공개되지 않음");

  const n = songNeeds(song(m[2], { lyrics_none: fmValue(m[1], "lyrics_none"), keywords: [], emotion: "" }));
  assert.equal(n.lyrics, 0, "원문이 없다고 표시했으니 '가사 없음'으로 다시 묻지 않는다");
  assert.equal(n.translation, 0);
  assert.equal(n.keywords, 0);
  assert.equal(n.emotion, 0);
}
console.log("✓ 가사 없이 등록한 글");

{
  const status = translationStatus(song("Need this translated\n\n완료된 줄\n> translated", { lang: "en" }));
  assert.equal(status.count, 1);
  assert.equal(status.stanzas[0].lines[0].translationMissing, true);
  assert.equal(status.stanzas[1].lines[0].translationMissing, undefined);
}
console.log("✓ 상세 미번역 표시는 공통 needs 판정을 재사용");

// 번역 칸이 차 있다는 것과 그 언어로 되어 있다는 것은 다르다.
// 아이유 <Dear my crazy soulmate>는 한국어 줄에 한국어 "번역"이 붙은 채
// 대기열을 통과하고 있었다 — 옮긴 게 아니라 같은 말을 고쳐 쓴 것이다.
{
  const [rewritten] = parseLyrics("그때 널 제일 좋아해\n> 그때가 널 가장 좋아할 때야");
  assert.equal(needsEn(rewritten.lines[0], "ko"), true, "한국어→한국어는 번역이 아니다");

  const [real] = parseLyrics("그때 널 제일 좋아해\n> That's when I like you most");
  assert.equal(needsEn(real.lines[0], "ko"), false, "영어로 옮겼으면 끝난 줄이다");

  // 한국어 방향에는 같은 검사를 걸지 않는다 — 추임새·고유명사는 라틴 그대로가 맞다.
  // 코퍼스 실측에서 이 비대칭이 없으면 "Bk, Bk, Bk" 같은 줄 268개가 새로 잡혔다.
  assert.equal(translationFilled("ko", "Bk, Bk, Bk"), true);
  assert.equal(translationFilled("en", "전부 잊어버려"), false);
  assert.equal(translationFilled("en", ""), false, "빈 칸은 어느 방향이든 미완");

  // 저장 전 검사는 대기열과 같은 규칙을 쓴다 — 둘이 어긋나면 통과한 것이 대기열에 뜬다
  const stanzas = parseLyrics("다 잊어버려\n> 전부 잊어버려\n\nDear my crazy soulmate\n> 나의 미친 영혼의 단짝");
  const reversed = wrongDirectionLines(stanzas, "ko");
  assert.equal(reversed.length, 1, "반대 방향은 한 줄");
  assert.equal(reversed[0].en, "다 잊어버려");
  assert.equal(reversed[0].target, "en");
  // 아직 안 채운 줄은 여기 몫이 아니다 — 그건 "안 함"이지 "반대로 함"이 아니다
  assert.equal(wrongDirectionLines(parseLyrics("다 잊어버려"), "ko").length, 0);
}
console.log("✓ 번역 방향 — 칸이 아니라 언어를 본다");

// 선언된 lang이 곡을 검사에서 빼 버리면 안 된다.
// 아이유 <Dear my crazy soulmate>는 가사 44줄 중 27줄이 한국어인데 lang: en으로
// 등록돼 있었고, needsEn이 lang === "ko"만 보고 있어서 한국어→한국어 재작성
// 201줄이 통째로 검사 밖이었다. 등록할 때 찍힌 글자 하나가 곡 전체를 가렸다.
{
  const body = "그때 널 제일 좋아해\n> 그때가 널 가장 좋아할 때야\n같이 있으면 뭐든\n> 함께 있으면 무엇이든\n다 잊어버려\n> 전부 잊어버려";
  const mislabelled = song(body, { lang: "en" });
  assert.equal(effectiveLang(mislabelled), "ko", "가사가 한국어면 한국어 곡이다");
  assert.ok(songNeeds(mislabelled).enTranslation > 0, "lang이 틀려도 검사에서 빠지지 않는다");

  // 영어곡에 한 줄 섞인 정도는 여전히 대상이 아니다 — 대기열이 의미를 잃는다
  const mostlyEnglish = song("I walked alone\n> 혼자 걸었어\n네가 없던 밤\n> The night without you");
  assert.equal(effectiveLang({ ...mostlyEnglish, lang: "en" }), "en", `한국어 줄 ${KOREAN_LINE_FLOOR}줄 미만`);
  assert.equal(songNeeds({ ...mostlyEnglish, lang: "en" }).enTranslation, 0);

  // ko로 선언된 곡은 가사를 세지 않고 그대로 ko다
  assert.equal(effectiveLang(song("Hello", { lang: "ko" })), "ko");
}
console.log("✓ 유효 언어 — 선언이 아니라 가사가 정한다");

// lang을 고쳐도 되는지는 가사만으로 정하지 않는다. 원문 칸에 한국어 번역이
// 잘못 들어간 외국곡(Kent <747>, Lamp <恋人へ>, The Vines <Country Yard>)이
// 한국 곡과 똑같이 보이기 때문이다 — 그 넷에 lang: ko를 넣으면 스웨덴 곡이
// 한국 곡이 된다.
{
  assert.equal(metadataSaysKorean({ tags: "[한국, Hip-Hop, 2020]", artist: "뱃사공" }), "tags:한국");
  assert.equal(metadataSaysKorean({ tags: "[K-Pop, 2026]", artist: "BTS" }), "tags:K-Pop");
  assert.equal(metadataSaysKorean({ tags: "[R&B/Soul, 2026]", artist: "태양" }), "artist:한글");
  // 외국곡은 근거가 없다 — 고치지 않고 사람에게 넘긴다
  for (const foreign of [
    { tags: "[유럽, Alternative Rock, 1997]", artist: "Kent" },
    { tags: "[일본, Dream Pop, 2004]", artist: "Lamp" },
    { tags: "[영미, Indie Rock, 2002]", artist: "The Vines" },
  ]) assert.equal(metadataSaysKorean(foreign), "", `${foreign.artist}: 고칠 근거가 없다`);
  assert.equal(metadataSaysKorean({}), "");
}
console.log("✓ lang 수정 근거 — 가사와 메타데이터가 둘 다 맞을 때만");
