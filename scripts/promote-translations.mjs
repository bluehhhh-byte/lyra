// 표시가 빠진 번역 줄을 `> `로 승격한다.
//   node scripts/promote-translations.mjs [--write]
//
// 인스타 캡션은 원문 여러 줄을 쓰고 그 아래 번역 여러 줄을 잇는 '블록'이 흔한데,
// 임포터는 (원문, 번역) 짝만 알아보고 첫 줄에만 `> `를 붙였다. 남은 번역 줄은
// 표시가 없어 파서·린트에는 '번역 없는 원문'으로 보인다 — 실제로는 번역이다.
//
// 승격 조건 (en/ja 곡만):
//   - 바로 위가 `>` 줄이고
//   - 이 줄이 한글을 담고 있고 (그 곡의 번역 언어)
//   - 원문 쪽 문자(라틴·가나·한자)가 주가 아닌 줄
// 줄 순서·내용은 그대로, 앞에 `> `만 붙인다.
import fs from "fs";
import { FM } from "../lib/admin/frontmatter.js";

const WRITE = process.argv.includes("--write");
const isNote = (s) => /^[🗨✏]/u.test(s); // 본인이 쓴 해설 — 가사도 번역도 아니다
const hangul = (s) => (s.match(/[가-힣]/g) || []).length;
const foreign = (s) => (s.match(/[a-zA-Z぀-ヿ一-鿿]/g) || []).length;

let files = 0, promoted = 0;
for (const f of fs.readdirSync("songs").filter((x) => x.endsWith(".md"))) {
  const raw = fs.readFileSync("songs/" + f, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(FM);
  if (!m) continue;
  if (/^lang:\s*ko\s*$/m.test(m[1])) continue; // 한국어 곡은 한글이 원문이다
  const lines = m[2].split("\n");
  let hit = 0;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith(">") || t.startsWith("+") || t.startsWith("//") || /^\[.*\]$/.test(t)) continue;
    if (!lines[i - 1].trim().startsWith(">")) continue; // 번역 줄 바로 아래만
    if (isNote(t) || hangul(t) < 2 || foreign(t) >= hangul(t)) continue; // 해설·원문 제외
    lines[i] = lines[i].replace(/^(\s*)/, "$1> ");
    hit++;
  }

  // 문단 통째로 번역인 경우 — 원문 문단을 쓰고 빈 줄 뒤에 번역 문단을 이어 쓴 형태.
  // 앞 문단이 전부 원문(번역 표시 없음)이고 이 문단이 전부 한글이면 번역으로 본다.
  const blocks = [];
  let cur = [];
  lines.forEach((l, i) => {
    if (l.trim()) cur.push(i);
    else { if (cur.length) blocks.push(cur); cur = []; }
  });
  if (cur.length) blocks.push(cur);
  const kind = (idx) => {
    const rows = idx.map((i) => lines[i].trim()).filter((t) => !/^\[.*\]$/.test(t) && !t.startsWith("//") && !t.startsWith("+") && !isNote(t));
    if (!rows.length) return "";
    if (rows.some((t) => t.startsWith(">"))) return "mixed";
    return rows.every((t) => hangul(t) >= 2 && foreign(t) < hangul(t)) ? "ko" : "src";
  };
  for (let b = 1; b < blocks.length; b++) {
    if (kind(blocks[b]) !== "ko" || kind(blocks[b - 1]) !== "src") continue;
    if (blocks[b].length > blocks[b - 1].length) continue; // 번역이 원문보다 많으면 판단 보류
    for (const i of blocks[b]) {
      const t = lines[i].trim();
      if (/^\[.*\]$/.test(t) || t.startsWith("//") || t.startsWith("+") || isNote(t)) continue;
      lines[i] = lines[i].replace(/^(\s*)/, "$1> ");
      hit++;
    }
  }
  if (!hit) continue;
  files++;
  promoted += hit;
  if (WRITE) fs.writeFileSync("songs/" + f, m[0].slice(0, m[0].length - m[2].length) + lines.join("\n"));
  console.log(`  ${WRITE ? "" : "(dry) "}${f}: ${hit}줄`);
}
console.log(`\n${WRITE ? "승격" : "승격 예정"} ${promoted}줄 / ${files}곡`);
