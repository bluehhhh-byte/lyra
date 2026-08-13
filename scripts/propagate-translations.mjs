// 같은 곡 안에서 똑같은 원문 줄이 다시 나오면 앞서 붙은 번역을 그대로 붙인다.
//   node scripts/propagate-translations.mjs [--write]
//
// 후렴처럼 반복되는 줄은 캡션에서 첫 번에만 번역이 달린 경우가 많다. 같은 줄은
// 같은 번역이라는 규칙(우리 번역 지침)을 그대로 적용하는 것뿐이라 판단이 필요 없다.
// 번역 문자열을 새로 만들지 않으며, 이미 번역이 있는 줄은 건드리지 않는다.
import fs from "fs";
import { FM } from "../lib/admin/frontmatter.js";

const WRITE = process.argv.includes("--write");
const isNote = (t) => /^[🗨✏]/u.test(t);
const skip = (t) => !t || t.startsWith(">") || t.startsWith("+") || t.startsWith("//") || /^\[.*\]$/.test(t) || isNote(t);

let files = 0, added = 0;
for (const f of fs.readdirSync("songs").filter((x) => x.endsWith(".md"))) {
  const raw = fs.readFileSync("songs/" + f, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(FM);
  if (!m) continue;
  const lines = m[2].split("\n");

  // 1차: 원문 → 바로 아래 번역 (1:1로 확실히 짝지어진 것만 채집)
  const known = new Map();
  for (let i = 0; i < lines.length - 1; i++) {
    const t = lines[i].trim();
    if (skip(t)) continue;
    const next = lines[i + 1].trim();
    if (!next.startsWith(">") || /^>\^/.test(next)) continue;
    const ko = next.replace(/^>\s?/, "");
    if (known.has(t) && known.get(t) !== ko) known.set(t, null); // 번역이 갈리면 복제하지 않는다
    else if (!known.has(t)) known.set(t, ko);
  }

  const out = [];
  let hit = 0;
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const t = lines[i].trim();
    if (skip(t)) continue;
    if ((lines[i + 1] || "").trim().startsWith(">")) continue; // 이미 번역이 있다
    // 1:1로 적힌 자리에서만 넣는다. 원문이 줄줄이 이어지는 블록형 한가운데에 끼워
    // 넣으면 그 아래 번역 묶음과 원문의 짝이 통째로 한 칸씩 밀린다.
    const prev = (lines[i - 1] || "").trim();
    if (i > 0 && prev && !prev.startsWith(">") && !/^\[.*\]$/.test(prev)) continue;
    const ko = known.get(t);
    if (!ko) continue;
    out.push(`> ${ko}`);
    hit++;
  }
  if (!hit) continue;
  files++;
  added += hit;
  if (WRITE) fs.writeFileSync("songs/" + f, m[0].slice(0, m[0].length - m[2].length) + out.join("\n"));
  console.log(`  ${WRITE ? "" : "(dry) "}${f}: ${hit}줄`);
}
console.log(`\n${WRITE ? "복제" : "복제 예정"} ${added}줄 / ${files}곡`);
