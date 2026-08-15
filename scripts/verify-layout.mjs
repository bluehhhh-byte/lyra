// 화면 폭 회귀 검사 — 페이지가 기기 폭보다 넓어지지 않는지, SVG 안 글자가 잘리지 않는지.
//
//   pnpm build && pnpm start -p 3401
//   node scripts/verify-layout.mjs            (기본 http://localhost:3401)
//   node scripts/verify-layout.mjs https://…  (배포된 주소로도 된다)
//
// 눈으로 보는 스크린샷만으로는 "오른쪽으로 조금 끌린다"를 놓친다. 실제로 한 번 놓쳤고,
// 원인은 sr-only를 <table>에 직접 준 것이었다(width:1px이 테이블에 먹지 않는다).
// 그래서 수치로 못 박는다.
//
// Playwright는 이 저장소의 의존성이 아니다 — 필요할 때만 `npm i -D playwright`로 받는다.
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("playwright가 없다. `npm i -D playwright && npx playwright install chromium` 뒤 다시 실행하라.");
  process.exit(0);
}

const BASE = process.argv[2] || process.env.BASE || "http://localhost:3401";
const SIZES = [[320, 568], [360, 800], [390, 844], [768, 1024], [1440, 900]];
const PATHS = ["/", "/archive"];
const THEMES = ["dark", "light"];

const probe = () => {
  const vw = window.innerWidth;
  const wide = [];
  if (document.documentElement.scrollWidth > vw || document.body.scrollWidth > vw) {
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      // 안에서 가로로 스크롤되는 컨테이너는 의도된 것이라 세지 않는다
      let inScroller = false;
      for (let p = el.parentElement; p; p = p.parentElement)
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) { inScroller = true; break; }
      if (inScroller) continue;
      if (r.right > vw + 0.5 || r.left < -0.5)
        wide.push(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").slice(0, 50)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
  }
  // 보이는 SVG의 모든 text가 viewBox 안에 있는지 (getBBox는 viewBox 좌표계다)
  const clipped = [];
  let minGlyph = Infinity;
  for (const svg of document.querySelectorAll("svg[viewBox]")) {
    if (!svg.getClientRects().length) continue; // display:none인 쪽은 건너뛴다
    const [vx, vy, w, h] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    for (const t of svg.querySelectorAll("text")) {
      let b;
      try { b = t.getBBox(); } catch { continue; }
      if (b.x < vx || b.y < vy || b.x + b.width > vx + w || b.y + b.height > vy + h)
        clipped.push(`"${(t.textContent || "").slice(0, 10)}" ${b.x.toFixed(1)},${b.y.toFixed(1)}~${(b.x + b.width).toFixed(1)},${(b.y + b.height).toFixed(1)} / viewBox ${vx},${vy}~${vx + w},${vy + h}`);
      const rect = t.getBoundingClientRect();
      if (rect.height) minGlyph = Math.min(minGlyph, rect.height);
    }
  }
  return {
    vw,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    wide: wide.slice(0, 6),
    clipped: clipped.slice(0, 6),
    minGlyph: minGlyph === Infinity ? null : +minGlyph.toFixed(1),
  };
};

// 모바일에서 이보다 작아지면 한글을 읽을 수 없다
const MIN_GLYPH_PX = 10;

let fails = 0;
const browser = await chromium.launch();
for (const theme of THEMES) {
  for (const [w, h] of SIZES) {
    for (const path of PATHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.addInitScript((t) => localStorage.setItem("lyra_theme", t), theme);
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      const r = await page.evaluate(probe);
      const tooSmall = r.minGlyph !== null && r.minGlyph < MIN_GLYPH_PX;
      const ok = r.doc <= r.vw && r.body <= r.vw && !r.clipped.length && !tooSmall;
      if (!ok) fails++;
      console.log(`${ok ? "  ok" : "FAIL"} ${theme} ${w}×${h} ${path} — doc ${r.doc} · body ${r.body} · vw ${r.vw}${r.minGlyph ? ` · 최소 글자 ${r.minGlyph}px` : ""}`);
      for (const x of r.wide) console.log(`       폭 초과: ${x}`);
      for (const x of r.clipped) console.log(`       글자 잘림: ${x}`);
      if (tooSmall) console.log(`       글자가 ${r.minGlyph}px로 작다 (최소 ${MIN_GLYPH_PX}px)`);
      await ctx.close();
    }
  }
}
await browser.close();
console.log(fails ? `\n${fails}건 실패` : "\n전부 통과");
process.exit(fails ? 1 : 0);
