import fs from "node:fs";

const cssUrl = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";
const fullUrl = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2";
const globals = fs.readFileSync("app/globals.css", "utf8");
const htmlPath = ".next/server/app/index.html";
if (!fs.existsSync(htmlPath)) throw new Error("먼저 pnpm build를 실행해 홈페이지 HTML을 만드세요.");

const pageText = fs.readFileSync(htmlPath, "utf8").replace(/<[^>]*>/g, " ");
const codePoints = new Set(Array.from(pageText, (character) => character.codePointAt(0)));
const cssResponse = await fetch(cssUrl);
if (!cssResponse.ok) throw new Error(`Pretendard CSS ${cssResponse.status}`);
const css = await cssResponse.text();

function inRange(codePoint, token) {
  const [start, end = start] = token.trim().replace(/^U\+/i, "").split("-");
  if (start.includes("?")) {
    const low = Number.parseInt(start.replaceAll("?", "0"), 16);
    const high = Number.parseInt(start.replaceAll("?", "F"), 16);
    return codePoint >= low && codePoint <= high;
  }
  return codePoint >= Number.parseInt(start, 16) && codePoint <= Number.parseInt(end, 16);
}

const selected = new Set();
for (const block of css.matchAll(/@font-face\{([^}]+)\}/g)) {
  const url = block[1].match(/url\(([^)]+\.woff2)\)/)?.[1]?.replaceAll('"', "");
  const ranges = block[1].match(/unicode-range:([^;}]+)/)?.[1]?.split(",") || [];
  if (url && ranges.some((range) => [...codePoints].some((point) => inRange(point, range))))
    selected.add(new URL(url, cssUrl).href);
}

async function bytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return (await response.arrayBuffer()).byteLength;
}

const subsetAssets = await Promise.all([...selected].map(bytes));
const cssBytes = Buffer.byteLength(css);
const subsetFontBytes = subsetAssets.reduce((sum, value) => sum + value, 0);
const fullFontBytes = await bytes(fullUrl);
const subsetTotal = cssBytes + subsetFontBytes;
const savedBytes = fullFontBytes - subsetTotal;
const savedPercent = (savedBytes / fullFontBytes) * 100;

console.log(`홈 초기 HTML 고유 문자 ${codePoints.size}자`);
console.log(`동적 서브셋 CSS ${cssBytes} bytes + woff2 ${selected.size}개 ${subsetFontBytes} bytes = ${subsetTotal} bytes`);
console.log(`전체 variable woff2 ${fullFontBytes} bytes`);
console.log(`초기 전송 절감 ${savedBytes} bytes (${savedPercent.toFixed(1)}%)`);

if (process.argv.includes("--check")) {
  if (!globals.includes(cssUrl)) throw new Error("globals.css가 감사한 고정 버전 동적 서브셋을 사용하지 않습니다.");
  if (!selected.size || subsetTotal >= fullFontBytes) throw new Error("동적 서브셋이 전체 폰트보다 작지 않습니다.");
}
