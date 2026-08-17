// 번역(`> `) 반영 — 원문 줄 바로 아래에 끼운다. 독음(`+ `)이 있으면 그 아래다.
//   node scripts/apply-translations.mjs <tr-out-N.json ...>
//
// 입력: { "songs": { "<slug>": { "map": { "<원문 줄>": "<번역>" } } } }
// 원문을 키로 쓰므로 같은 줄이 여러 번 나오면 같은 번역이 들어간다 — 후렴이 곡 안에서
// 제각각 번역되던 문제(문맥별 번역 차이)를 애초에 만들지 않는다. 일부러 다르게 하고 싶으면
// 나중에 그 줄만 손으로 고치고 근거를 남긴다.
//
// 원문은 건드리지 않는다. 이미 번역이 붙은 줄은 넘어간다.
import fs from "fs";
import { isSectionLabel } from "../lib/songs.js";
import { FM } from "../lib/admin/frontmatter.js";
import { guard } from "../lib/admin/preflight.js";

guard();
// 인스타 캡션에는 줄바꿈이 U+2028(LINE SEPARATOR)로 들어온 곳이 있다 — 눈에는 공백으로
// 보이니 키를 공백으로 적어도 맞도록 같이 눕힌다.
const norm = (s) => s.replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s/g, " ").trim();

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
    const byLine = new Map(Object.entries(map).map(([k, v]) => [norm(k), v]));
    const out = [];
    const used = new Set();
    let hit = 0;
    for (let i = 0; i < lines.length; i++) {
      out.push(lines[i]);
      const t = norm(lines[i]);
      // 번역·독음·문단 메모·구간 표시([Chorus])·본인 해설(🗨✏)은 번역 대상이 아니다
      // `[…]`가 전부 구간 표시는 아니다 — 파서와 같은 기준(isSectionLabel)으로 가른다
      if (!t || /^[>+]/.test(t) || t.startsWith("//") || /^[🗨✏]/u.test(t)) continue;
      if (t.startsWith("[") && t.endsWith("]") && isSectionLabel(t.slice(1, -1))) continue;
      // 원문 다음 줄이 독음이면 번역은 그 아래로 간다
      let j = i;
      while ((lines[j + 1] || "").trim().startsWith("+")) { out.push(lines[++j]); }
      if ((lines[j + 1] || "").trim().startsWith(">")) { skipped++; i = j; continue; } // 이미 번역 있음
      const tr = byLine.get(t);
      i = j;
      if (!tr) continue;
      out.push(`> ${tr}`);
      used.add(t);
      hit++;
    }
    const notUsed = [...byLine.keys()].filter((k) => !used.has(k));
    missed += notUsed.length;
    if (notUsed.length) console.log(`  !! ${slug} 미적용 ${notUsed.length}: ${notUsed.slice(0, 2).join(" | ")}`);
    if (!hit) continue;
    fs.writeFileSync(p, head + out.join("\n"));
    files++;
    added += hit;
    console.log(`${slug}: +${hit}`);
  }
}
console.log(`\n곡 ${files} · 번역 ${added}줄 추가 · 이미 있어 건너뜀 ${skipped} · 원문을 못 찾은 항목 ${missed}`);
