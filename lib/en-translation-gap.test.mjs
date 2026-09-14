// 「영어 번역 없음」을 채우는 경로의 계약.
//
// 이 대기열은 형식 검사(lintFix)를 아무리 돌려도 줄지 않았다. 그쪽 선택 로직에
// "이미 한글인 줄에 한국어 번역을 붙이지 않는다"는 규칙이 있는데, 외국곡 속
// 한국어 가사를 지키는 그 규칙이 한국 곡의 한국어 줄까지 통째로 제외한다.
// 그래서 전용 경로를 뒀고, 이 파일은 그 경로가 지켜야 할 것을 적는다.
//   node --test lib/en-translation-gap.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { translationTarget, translationFilled } from "./admin/needs.js";

const route = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
const block = route.slice(route.indexOf('if (action === "enTranslate")'), route.indexOf('if (action === "audit")'));

test("the parser picks the lines, not a second scanner here", () => {
  // 원시 텍스트로 판정을 다시 만들면 파서가 이미 짝지어 둔 것을 놓친다.
  // The Vines <Winning Days>에는 `>` 없이 떠도는 번역 줄이 있고, 원시 스캔은
  // 그것을 번역 없는 한국어 원문으로 봤다. 11곡을 견줘 보니 83줄이어야 할
  // 선택이 111줄이었다 — 이미 번역이 있는 줄에 번역을 또 붙일 뻔했다.
  assert.match(block, /const parsedStanzas = parseLyrics\(bodyText\)/);
  assert.match(block, /if \(!needsEn\(line, lang\)\) continue/);
  // 줄바꿈으로 묶어 보지 않는다 — 이 저장소의 체크아웃은 CRLF다
  const imported = route.slice(route.indexOf("import {\r\n  songNeeds") >= 0 ? route.indexOf("import {\r\n  songNeeds") : route.indexOf("import {\n  songNeeds"));
  const names = imported.slice(0, imported.indexOf("admin/needs"));
  for (const name of ["effectiveLang", "needsEn", "translationFilled"])
    assert.ok(names.includes(name), `needs.js에서 ${name}을 가져오지 않는다`);
  // 세는 쪽도 같은 원천이다 — songNeeds가 화면 숫자를 만든다
  assert.match(route, /songNeeds\(song\)\.enTranslation/);
});

test("a line that appears twice is filled only as often as the parser asks", () => {
  // S.E.S. <Twilight Zone>은 「그대여 눈물 같은 너의 사랑」이 두 번 나오는데
  // 파서는 한 번만 결손으로 센다. 집합으로 보면 두 줄 다 채워 같은 번역이
  // 두 번 들어간다 — 그래서 텍스트별 개수를 세어 소진한다.
  assert.match(block, /const wantedCount = new Map\(\)/);
  assert.match(block, /if \(left <= 0\) return false/);
});

test("an inline translation counts as already filled", () => {
  // 인스타 캡션에서 온 줄 일부는 `원문<U+2028>번역`으로 한 줄에 붙어 있다.
  // 안 가르면 원문 전체를 번역 없는 줄로 세어, 이미 번역이 있는 줄에 또 붙인다.
  assert.match(block, /const INLINE = \/\[\\u2028\\u2029\]\//);
  assert.match(block, /split\(INLINE\)\[0\]/);
});

test("a Korean line with no translation is what we fill", () => {
  const line = { en: "다 잊어버려", ko: "" };
  assert.equal(translationTarget(line, "ko"), "en");
  assert.equal(translationFilled("en", line.ko), false);
});

test("a Korean line that already has English is left alone", () => {
  assert.equal(translationFilled("en", "Forget it all"), true);
});

test("Korean pretending to be the English translation does not count as filled", () => {
  // 아이유 <Dear my crazy soulmate>에 "다 잊어버려"의 번역으로 "전부 잊어버려"가
  // 붙어 있었다. 칸이 차 있으니 검사를 통과했다.
  assert.equal(translationFilled("en", "전부 잊어버려"), false);
  // 그래서 생성 결과도 같은 잣대로 거른다 — 영어를 달라고 했는데 한국어가 오면 버린다
  assert.match(block, /if \(!translationFilled\("en", text\)\) \{/);
});

test("the original lyrics and the frontmatter are never touched", () => {
  // 원문 가사와 source_hash는 절대 변경하지 않는다.
  assert.match(block, /`---\\n\$\{fm\}\\n---\\n\$\{lines\.join\("\\n"\)/, "frontmatter를 그대로 다시 쓴다");
  // 넣는 것은 `> ` 줄뿐이다
  assert.match(block, /lines\.splice\(at, 0, `> \$\{capitalizeLyricLines\(text\)\}`\)/);
  assert.ok(!/lines\[.*\] =/.test(block), "원문 줄에 대입하는 곳이 있다");
});

test("lines covered by a >^N span are refused", () => {
  // 덮인 줄에 번역을 또 붙이면 같은 구절이 두 번 나오고 범위가 어긋난다 —
  // 실제로 그렇게 깨진 적이 있다.
  assert.match(block, /if \(coveredBySpan\(row\.index\)\) return false/);
  assert.match(block, /const span = t\.match\(\/\^>\\\^\(\\d\+\)\/\)/);
});

test("a failed Gemini call is not retried", () => {
  // 5xx·무응답 재시도는 한도만 태우고 같은 답이 온다. 이 정책을 되돌리지 말 것.
  assert.match(block, /5xx·무응답은 재시도하지 않는다/);
  assert.ok(!/for \(let attempt/.test(block), "재시도 루프가 생겼다");
  // 줄 수가 어긋난 응답은 통째로 버린다 — 어긋난 채 끼우면 다른 줄에 붙는다
  assert.match(block, /translated\.length !== wanted\.length/);
});

test("the tool is mounted in the admin page", () => {
  const page = fs.readFileSync(new URL("../app/admin/tools/page.js", import.meta.url), "utf8");
  assert.match(page, /import EnTranslationGap from "\.\.\/en-translation-gap"/);
  assert.match(page, /<EnTranslationGap \/>/);
});
