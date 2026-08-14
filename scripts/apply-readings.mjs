// 일본어 독음(`+ 한글 독음`) 반영 — 원문 줄 바로 아래에 끼운다.
//   node scripts/apply-readings.mjs <rd-out-N.json ...>
//
// 원문은 건드리지 않고 `+ ` 줄만 넣는다. 이미 독음이 있는 줄은 넘어간다.
import fs from "fs";
import { isSectionLabel } from "../lib/songs.js";
import { FM } from "../lib/admin/frontmatter.js";
import { isJaLine } from "../lib/admin/song-meta.js";
import { guard } from "../lib/admin/preflight.js";

guard();
let added = 0, files = 0, missed = 0, skipped = 0;
for (const file of process.argv.slice(2)) {
  let songs;
  try { ({ songs } = JSON.parse(fs.readFileSync(file, "utf8"))); }
  catch { console.log(`  읽기 실패: ${file}`); continue; }

  for (const [slug, { map = {} }] of Object.entries(songs || {})) {
    const p = `songs/${slug}.md`;
    if (!fs.existsSync(p)) { console.log(`  없음: ${slug}`); continue; }
    const raw = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) continue;
    const head = raw.slice(0, raw.length - m[2].length);
    const lines = m[2].split("\n");
    const out = [];
    const used = new Set();
    let hit = 0;
    for (let i = 0; i < lines.length; i++) {
      out.push(lines[i]);
      const t = lines[i].trim();
      // `[…]`가 전부 구간 표시는 아니다 — 대괄호로 감싼 가사 줄도 있다.
      // 파서와 같은 기준(isSectionLabel)을 써야 여기서 건너뛴 줄이 화면에는 가사로 남는 일이 없다.
      if (!t || t.startsWith(">") || t.startsWith("+") || t.startsWith("//")) continue;
      if (t.startsWith("[") && t.endsWith("]") && isSectionLabel(t.slice(1, -1))) continue;
      if (!isJaLine(t)) continue;                                   // 일본어 줄에만
      if ((lines[i + 1] || "").trim().startsWith("+")) { skipped++; continue; } // 이미 있음
      const rd = map[t];
      if (!rd) continue;
      if (!/[가-힣]/.test(rd)) continue;                             // 독음은 한글이어야 한다
      out.push(`+ ${rd}`);
      used.add(t);
      hit++;
    }
    const notUsed = Object.keys(map).filter((k) => !used.has(k));
    missed += notUsed.length;
    if (notUsed.length) console.log(`  !! ${slug} 미적용 ${notUsed.length}: ${notUsed.slice(0, 2).join(" | ")}`);
    if (!hit) continue;
    fs.writeFileSync(p, head + out.join("\n"));
    files++;
    added += hit;
    console.log(`${slug}: +${hit}`);
  }
}
console.log(`\n독음 ${added}줄 / ${files}곡 · 이미 있음 ${skipped} · 미적용 키 ${missed}`);
