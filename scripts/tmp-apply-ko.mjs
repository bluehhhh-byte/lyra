// 에이전트 산출 한글 번역을 곡 파일에 반영 — `> ` 삽입만, 원문 무변경.
//   node scripts/tmp-apply-ko.mjs <ko-out-N.json ...>
import fs from "fs";

let added = 0, missKey = 0, files = 0;
for (const file of process.argv.slice(2)) {
  let songs;
  try { ({ songs } = JSON.parse(fs.readFileSync(file, "utf8"))); } catch { console.log(`  읽기 실패: ${file}`); continue; }
  for (const [slug, { map = {} }] of Object.entries(songs)) {
    if (!Object.keys(map).length) continue;
    const p = `songs/${slug}.md`;
    if (!fs.existsSync(p)) { console.log(`  없음: ${slug}`); continue; }
    const lines = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let hit = 0, body = 0;
    const used = new Set();
    for (let i = 0; i < lines.length; i++) {
      out.push(lines[i]);
      if (lines[i] === "---") { body++; continue; }
      if (body < 2) continue;
      const key = lines[i].trim();
      if (!key || key.startsWith(">") || key.startsWith("+") || key.startsWith("//") || /^\[.*\]$/.test(key)) continue;
      // 바로 아래가 이미 번역이면 건드리지 않는다
      if ((lines[i + 1] || "").trim().startsWith(">")) continue;
      if (map[key]) { out.push(`> ${map[key]}`); hit++; used.add(key); }
    }
    const missed = Object.keys(map).filter((k) => !used.has(k));
    missKey += missed.length;
    if (missed.length) console.log(`  !! ${slug} 미적용 ${missed.length}: ${missed.slice(0, 2).join(" | ")}`);
    if (hit) { fs.writeFileSync(p, out.join("\n")); files++; added += hit; console.log(`${slug}: +${hit}`); }
  }
}
console.log(`\n삽입 ${added}줄 / ${files}곡 · 미적용 키 ${missKey}`);
