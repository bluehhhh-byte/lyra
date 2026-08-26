import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const scope = readFileSync(new URL("../app/scope.js", import.meta.url), "utf8");
const theme = readFileSync(new URL("../app/theme-toggle.js", import.meta.url), "utf8");

assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\*,[\s\S]*animation-duration: 0\.01ms !important/);
assert.match(css, /transition-duration: 0\.01ms !important/, "캐러셀과 UI 전환도 즉시 끝나야 한다");
assert.match(css, /scroll-behavior: auto !important/, "해시 이동의 부드러운 스크롤을 끈다");
assert.match(scope, /prefers-reduced-motion: reduce/, "배경 canvas도 사용자 설정을 따라야 한다");
assert.match(theme, /prefers-reduced-motion: reduce/, "테마 전환 원형 애니메이션도 사용자 설정을 따라야 한다");
