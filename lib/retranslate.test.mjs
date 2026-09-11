// 번역 줄만 갈아 끼우는 치환 — scripts/fix-reversed-translations.mjs가 DB에
// 사람 없이 쓰는 경로라, 여기서 불변식을 못 박는다.
//   node --test lib/retranslate.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { replaceTranslations } from "./admin/song-meta.js";
import { parseLyrics } from "./songs.js";

const originalsOf = (body) => parseLyrics(body).flatMap((s) => s.lines).map((l) => l.en);

test("a repeated chorus is replaced everywhere, not just the first time", () => {
  // 첫 자리만 고치면 두 번째부터는 이미 바뀐 줄을 보게 되어 was가 어긋나고
  // 조용히 빠진다 — 실측으로 13줄 중 5줄이 그렇게 빠졌다.
  const body = [
    "못 본 척하고 지나쳐줘 Baby",
    "> 못 본 척하고 지나쳐줘, 그대",
    "",
    "못 본 척하고 지나쳐줘 Baby",
    "> 못 본 척하고 지나쳐줘, 그대",
  ].join("\n");
  const { body: out, changed, missed } = replaceTranslations(body, [
    { en: "못 본 척하고 지나쳐줘 Baby", was: "못 본 척하고 지나쳐줘, 그대", now: "Pretend you didn't see me, baby" },
  ]);
  assert.equal(changed, 2, "후렴 두 자리가 모두 바뀐다");
  assert.deepEqual(missed, []);
  assert.equal((out.match(/Pretend you didn't see me, baby/g) || []).length, 2);
});

test("the original lines never move", () => {
  const body = ["그때 널 제일 좋아해", "> 그때가 널 가장 좋아할 때야", "다 잊어버려", "> 전부 잊어버려"].join("\n");
  const { body: out } = replaceTranslations(body, [
    { en: "그때 널 제일 좋아해", was: "그때가 널 가장 좋아할 때야", now: "That's when I like you most" },
    { en: "다 잊어버려", was: "전부 잊어버려", now: "Forget it all" },
  ]);
  assert.deepEqual(originalsOf(out), originalsOf(body), "원문은 한 줄도 바뀌지 않는다");
});

test("a translation someone else changed is left alone", () => {
  // was가 다르면 그 사이에 사람이 손댄 것이다 — 덮어쓰지 않는다
  const body = ["다 잊어버려", "> 누가 이미 고쳐 둔 번역"].join("\n");
  const { body: out, changed, missed } = replaceTranslations(body, [
    { en: "다 잊어버려", was: "전부 잊어버려", now: "Forget it all" },
  ]);
  assert.equal(changed, 0);
  assert.deepEqual(missed, ["다 잊어버려"]);
  assert.equal(out, body, "한 글자도 바뀌지 않는다");
});

test("a line with no translation under it is not given one", () => {
  // 빈 줄은 이 도구의 몫이 아니다 — 그건 "아직 안 함"이고 대기열이 본다
  const body = ["다 잊어버려", "", "다음 연"].join("\n");
  const { changed, missed, body: out } = replaceTranslations(body, [
    { en: "다 잊어버려", was: "전부 잊어버려", now: "Forget it all" },
  ]);
  assert.equal(changed, 0);
  assert.deepEqual(missed, ["다 잊어버려"]);
  assert.equal(out, body);
});

test("a reading line between the original and its translation is stepped over", () => {
  // 일본어 줄은 원문과 번역 사이에 `+ 독음`이 끼어 있다. 바로 아래만 보면
  // 독음을 만나 멈추고, 그 줄은 영영 고쳐지지 않는다 — 뉴진스 <Supernatural>이
  // 실제로 그렇게 빠졌다.
  const body = ["夜に駆ける", "+ 요루니 카케루", "> 밤을 달리다"].join("\n");
  const { changed, body: out } = replaceTranslations(body, [
    { en: "夜に駆ける", was: "밤을 달리다", now: "Racing into the night" },
  ]);
  assert.equal(changed, 1);
  assert.ok(out.includes("+ 요루니 카케루"), "독음은 그대로 남는다");
  assert.ok(out.includes("> Racing into the night"));
});

test("a reading is never mistaken for the translation itself", () => {
  const body = ["夜に駆ける", "+ 요루니 카케루", "> 밤을 달리다"].join("\n");
  const { changed, body: out } = replaceTranslations(body, [
    { en: "夜に駆ける", was: "요루니 카케루", now: "Racing into the night" },
  ]);
  assert.equal(changed, 0, "was가 독음이면 맞는 자리가 아니다");
  assert.equal(out, body);
});

test("a merged >^N translation is left alone", () => {
  // `>^2`는 원문 두 줄을 한 번에 덮는다. 평범한 `> `로 바꾸면 덮던 범위가 깨져
  // 위쪽 줄이 번역을 잃는다. koMerged 줄은 애초에 대상에서 빠지지만, 실수로
  // 들어와도 망가지지 않아야 한다.
  const body = ["A line", "B line", ">^2 두 줄을 한 번에 옮긴 번역"].join("\n");
  const { changed, body: out } = replaceTranslations(body, [
    { en: "A line", was: "두 줄을 한 번에 옮긴 번역", now: "Both lines at once" },
  ]);
  assert.equal(changed, 0);
  assert.equal(out, body, "한 글자도 바뀌지 않는다");
});
