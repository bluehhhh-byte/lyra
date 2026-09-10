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

// 곡 카드도 판단을 드러낸다 — 영화 카드가 별점을 보여주는 자리에 곡은 아무것도
// 없었다. 감정은 궤도·통계의 축인데 목록에서 훑을 수 없으면 데이터가 갇힌다.
const browse = read("app/browse.js");
assert.match(browse, /valenceColor\(emotionValence\(s\.emotion\)\)/, "감정 점은 사이트가 이미 쓰는 밝기 색 언어를 따른다");
assert.match(browse, /\{s\.emotion && <span className="shrink-0/, "감정 낱말도 함께 보여야 색만으로 못 읽는 사람에게 남는다");

// 대비는 눈대중이 아니라 계산으로 지킨다 — muted는 안내 문구가 앉는 색이라
// 두 테마 · 두 배경(bg·surface) 전부에서 AA(4.5:1)를 넘어야 한다.
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const relLum = (rgbv) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgbv.map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = relLum(hexRgb(a)), y = relLum(hexRgb(b)); const [hi, lo] = x > y ? [x, y] : [y, x]; return (hi + 0.05) / (lo + 0.05); };
const token = (block, name) => css.slice(css.indexOf(block)).match(new RegExp(`--color-${name}: (#[0-9a-f]{6})`))?.[1];

const darkMuted = token("@theme", "muted");
const lightMuted = token('[data-theme="light"]', "muted");
for (const [label, fg, bgs] of [
  ["다크", darkMuted, ["#12100e", "#211d19"]],
  ["라이트", lightMuted, ["#f6f1e4", "#efe8d6"]],
]) {
  for (const bgHex of bgs) {
    const r = contrast(fg, bgHex);
    assert.ok(r >= 4.5, `${label} muted ${fg} on ${bgHex}: ${r.toFixed(2)} — AA 4.5:1 미달`);
  }
}

// 상태색은 토큰으로만. 공개 화면에 팔레트를 직접 박으면 두 테마에서 값이 갈리지
// 않고, dark: 변형은 OS를 따라가 이 사이트의 data-theme 체계와 어긋난다.
const publicFiles = walk(appDir).filter((f) => !f.includes(`${path.sep}admin${path.sep}`));
const adhoc = [];
for (const file of publicFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/\b(?:text|bg|border)-(?:red|green|emerald|amber|orange|rose)-\d{3}\b/g)) {
    adhoc.push(`${path.relative(appDir, file)}: ${m[0]}`);
  }
}
assert.deepEqual(adhoc, [], `공개 화면의 상태색은 ok/warn/danger 토큰만 쓴다:\n${adhoc.join("\n")}`);
