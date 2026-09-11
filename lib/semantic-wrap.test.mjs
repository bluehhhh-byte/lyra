import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { koTitleModel } from "./vendor/semantic-wrap/ko.ts";
import { selectLineBreaks } from "./vendor/semantic-wrap/index.ts";

// 벤더링한 사본이 실제로 살아 있는지 확인한다. 남의 코드를 복사해 두면 가장
// 흔한 사고가 "빌드는 되는데 아무도 안 불러서 죽은 줄 몰랐다"는 것이다.

// 폭 측정은 호출자 몫 — 한글 1.0 / 영숫자 0.58 (orbit.js의 textWidth와 같은 근사).
const approxWidth = (text) => {
  let units = 0;
  for (const ch of text) units += /[가-힣]/.test(ch) ? 1 : /[0-9A-Za-z]/.test(ch) ? 0.58 : 0.55;
  return units;
};
const wrap = (text, maxWidth) =>
  selectLineBreaks({ text, model: koTitleModel, maxWidth, measureText: approxWidth });

test("Korean sentences break at meaning, not at whatever fits", () => {
  const { lines } = wrap("이 순간을 기념품처럼 챙기고 싶은 밤", 11);
  assert.deepEqual(lines, ["이 순간을 기념품처럼", "챙기고 싶은 밤"]);

  const long = wrap("오늘보다 더 기쁜 날은 남은 생에 많지 않을 것이다", 14);
  assert.deepEqual(long.lines, ["오늘보다 더 기쁜 날은", "남은 생에 많지 않을 것이다"]);
});

test("every line stays inside the width it was given", () => {
  for (const width of [8, 11, 14, 20]) {
    const { lines } = wrap("세계는 그것을 사랑이라 부른다", width);
    for (const line of lines) {
      assert.ok(approxWidth(line) <= width, `"${line}" (${approxWidth(line).toFixed(1)}) > ${width}`);
    }
    assert.equal(lines.join(" "), "세계는 그것을 사랑이라 부른다", "글자는 하나도 잃지 않는다");
  }
});

test("text that already fits is left as one line", () => {
  const { lines } = wrap("짧은 제목", 40);
  assert.deepEqual(lines, ["짧은 제목"]);
});

// 벤더링 사본은 원본과 딱 한 가지만 달라야 한다(import 확장자). 그 외의 손질이
// 섞이면 다음 갱신 때 무엇을 보존해야 하는지 아무도 모르게 된다.
test("the vendored copy carries its licence and its provenance", () => {
  const dir = new URL("./vendor/semantic-wrap/", import.meta.url);
  for (const file of ["LICENSE", "NOTICE", "VENDORING.md"]) {
    assert.ok(fs.readFileSync(new URL(file, dir), "utf8").length > 0, `${file}이 있어야 한다`);
  }
  const notes = fs.readFileSync(new URL("VENDORING.md", dir), "utf8");
  assert.match(notes, /v0\.4\.0/, "어느 버전을 가져왔는지 적혀 있어야 한다");
  assert.match(notes, /Apache-2\.0/, "라이선스를 명시해야 한다");
});

test("no import escapes the vendored folder", () => {
  const dir = new URL("./vendor/semantic-wrap/", import.meta.url);
  const files = ["index.ts", "ko.ts", "ko-models.ts", ...fs.readdirSync(new URL("core/", dir)).map((f) => `core/${f}`)];
  for (const file of files) {
    const source = fs.readFileSync(new URL(file, dir), "utf8");
    for (const [, spec] of source.matchAll(/from\s+"([^"]+)"/g)) {
      assert.ok(spec.startsWith("."), `${file}: 외부 패키지 참조 "${spec}" — 사본은 자급자족해야 한다`);
      assert.match(spec, /\.ts$/, `${file}: "${spec}"에 .ts가 없으면 node --test가 못 푼다`);
    }
  }
});
