import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 디자인 브리프 §6·§9의 계약 — 표제 스케일과 상태색 토큰.
//
// 표제는 4단뿐이다: hero(3xl→5xl, 화면당 1) · display(3xl→4xl, 기록 상세) ·
// title(2xl, 목록·집계·관리자) · section(lg, h2). 브리프를 쓰기 전 h1 크기가
// 일곱 가지였다 — 스케일이 없으면 화면마다 임의 값이 다시 늘어난다.

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── 상태색 토큰: 다크·라이트 각각 정의되어야 한다 ──
const css = read("app/globals.css");
for (const token of ["--color-ok", "--color-warn", "--color-danger"]) {
  const count = css.split(token).length - 1;
  assert.ok(count >= 2, `${token}은 다크 기본값과 라이트 재정의 둘 다 있어야 한다 (현재 ${count}곳)`);
}

// ── 상태색은 토큰으로만: 공유 오류 컴포넌트에 팔레트 직접 지정 금지 ──
// dark: 변형은 OS 설정을 따라가서 data-theme 체계와 어긋난다 (실사고).
const errorMessage = read("app/admin/error-message.js");
assert.match(errorMessage, /text-danger/, "오류 문구는 danger 토큰을 써야 한다");
assert.doesNotMatch(errorMessage, /red-\d|dark:(text|bg|border)/, "오류 컴포넌트에 팔레트 직접 지정·dark: 변형 금지");

// ── 판단 유보는 muted에 묻히지 않는다 ──
assert.match(read("app/archive/archive-view.js"), /text-warn/, "판단 유보는 warn으로 표시해야 한다");

// ── h1 스케일 전수 검사 ──
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith(".js") ? [full] : [];
  });

const ALLOWED = (cls) =>
  /\btext-2xl\b/.test(cls) ||
  (/\btext-3xl\b/.test(cls) && /sm:text-(4|5)xl/.test(cls));

const appDir = fileURLToPath(new URL("../app", import.meta.url));
const offenders = [];
for (const file of walk(appDir)) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/<h1[^>]*className="([^"]*)"/g)) {
    if (!ALLOWED(match[1])) offenders.push(`${path.relative(appDir, file)}: "${match[1]}"`);
  }
}
assert.deepEqual(offenders, [], `h1은 title(text-2xl)·display(3xl→4xl)·hero(3xl→5xl)만 허용:\n${offenders.join("\n")}`);

console.log("design scale contract passed");
