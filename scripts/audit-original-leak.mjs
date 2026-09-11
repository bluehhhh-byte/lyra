// 원문 칸에 번역이 들어간 곡을 찾는다.
//
// 번역 방향 검사(lib/admin/needs.js)를 고치면서 드러났다. 외국곡인데 한국어 원문
// 줄이 여럿인 곡들이 있었고, 들여다보니 번역이 원문 자리로 새어 든 것이었다.
// 두 모양이다:
//
//   중복 블록 — 곡이 제대로 짜여 있고(원문 + `> ` 번역) 그 아래에 같은 번역이
//               원문 줄로 한 번 더 붙어 있다. Kent <747>, Lamp <恋人へ>.
//   붙임      — 원문 줄 끝에 번역이 그대로 이어 붙어 있다.
//               "The winning days are gone 승리의 날들은 지나갔어". The Vines.
//
// 고치려면 원문을 건드려야 한다 — docs/TRANSLATION.md §5의 교정 절차를 쓴다.
// 그래서 이 스크립트는 찾기만 하고 아무것도 쓰지 않는다.
//
//   node scripts/audit-original-leak.mjs
import fs from "node:fs";
import path from "node:path";
import { FM, fmValue } from "../lib/admin/frontmatter.js";
import { metadataSaysKorean } from "../lib/admin/needs.js";

const norm = (s) => String(s || "").replace(/\s+/g, " ").replace(/[.,!?…·]/g, "").trim();
const koRatio = (s) => {
  const t = String(s || "");
  const ko = (t.match(/[가-힣]/g) || []).length;
  const en = (t.match(/[A-Za-z぀-ヿ一-鿿]/g) || []).length;
  return { ko, en };
};
const isKoreanOnly = (s) => {
  const { ko, en } = koRatio(s);
  return ko >= 2 && en === 0;
};

const findings = [];
for (const file of fs.readdirSync("songs").filter((f) => f.endsWith(".md"))) {
  const raw = fs.readFileSync(path.join("songs", file), "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(FM);
  if (!m) continue;
  // 한국 곡은 한 줄에 두 언어를 쓰는 게 정상이다 — BIGBANG "20 years, man 스무고개
  // Twerk", Balming Tiger의 한 줄 병기. 그걸 유입으로 세면 오탐이 목록을 덮는다.
  // 외국곡의 원문 줄에 한국어가 있는 것만 본다.
  // lang: ko도 한국 곡 신호로 쓴다. lang은 빠뜨릴 때가 있어도(아이유 곡이 en이었다)
  // 없는 것을 ko로 적어 두지는 않는다 — 여기서는 안전한 방향이다.
  if (fmValue(m[1], "lang") === "ko") continue;
  if (metadataSaysKorean({ tags: fmValue(m[1], "tags"), artist: fmValue(m[1], "artist") })) continue;
  const lines = m[2].split("\n");
  const translations = new Set(
    lines.filter((l) => l.trim().startsWith(">")).map((l) => norm(l.replace(/^>\^?\d*\s*/, ""))),
  );

  // 중복 블록 — 번역으로 이미 쓰인 문장이 원문 줄로 또 나온다
  const dupes = [];
  // 붙임 — 한 줄 안에 외국어와 한국어가 같이 있고, 그 한국어가 이 곡의 번역과 겹친다
  const glued = [];
  for (const [i, line] of lines.entries()) {
    const t = line.trim();
    if (!t || /^[>+/[]/.test(t) || /^[🗨✏]/u.test(t)) continue;
    if (isKoreanOnly(t) && translations.has(norm(t))) { dupes.push({ at: i + 1, text: t }); continue; }
    // "라틴… 한글…" 꼴 — 뒤쪽 한글 덩어리를 떼어 번역 목록과 견준다
    const split = t.match(/^(.*?[A-Za-z぀-ヿ一-鿿][^가-힣]*?)\s+([가-힣][\s\S]*)$/);
    if (split && norm(split[2]).length >= 4) {
      const { ko, en } = koRatio(split[1]);
      if (en >= 4 && ko === 0) glued.push({ at: i + 1, head: split[1].trim(), tail: split[2].trim() });
    }
  }
  if (dupes.length || glued.length >= 3)
    findings.push({
      slug: file.replace(/\.md$/, ""),
      artist: fmValue(m[1], "artist"),
      title: fmValue(m[1], "title"),
      lang: fmValue(m[1], "lang"),
      dupes,
      glued,
    });
}

const withDupes = findings.filter((f) => f.dupes.length);
const withGlued = findings.filter((f) => f.glued.length >= 3);
console.log(`중복 블록: ${withDupes.length}곡 · 붙임: ${withGlued.length}곡\n`);

console.log("── 중복 블록 (번역이 원문 줄로 한 번 더) ──");
for (const f of withDupes) {
  console.log(`[${f.lang}] ${f.artist} — ${f.title} (${f.slug}) · ${f.dupes.length}줄`);
  for (const d of f.dupes.slice(0, 3)) console.log(`   ${d.at}행: ${d.text}`);
}

console.log("\n── 붙임 (원문 줄 끝에 번역) ──");
for (const f of withGlued) {
  console.log(`[${f.lang}] ${f.artist} — ${f.title} (${f.slug}) · ${f.glued.length}줄`);
  for (const g of f.glued.slice(0, 2)) console.log(`   ${g.at}행: "${g.head}" + "${g.tail}"`);
}
