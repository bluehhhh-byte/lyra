// 에이전트 산출(장르·연도·코멘트)을 곡 파일에 반영. 이미 값이 있으면 덮지 않는다.
//   node scripts/tmp-apply-fill.mjs gy <파일...>   장르·연도
//   node scripts/tmp-apply-fill.mjs cm <파일...>   코멘트
import fs from "fs";
import { FM, fmValue, setField } from "../lib/admin/frontmatter.js";
import { GENRES, COUNTRY_TAGS } from "../lib/genre.js";

const mode = process.argv[2];
const files = process.argv.slice(3);
const GEN = new Set(GENRES);
let genre = 0, year = 0, comment = 0, skipped = 0, missing = 0, bad = 0;

for (const file of files) {
  let items;
  try { ({ items } = JSON.parse(fs.readFileSync(file, "utf8"))); } catch { console.log(`  읽기 실패: ${file}`); continue; }
  for (const it of items || []) {
    const p = `songs/${it.slug}.md`;
    if (!fs.existsSync(p)) { missing++; continue; }
    let raw = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    const fm = raw.match(FM)?.[1];
    if (!fm) { missing++; continue; }

    if (mode === "gy") {
      const tags = (fmValue(fm, "tags") || "").replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
      const country = tags.find((t) => COUNTRY_TAGS.includes(t)) || "";
      let g = fmValue(fm, "genre"), y = fmValue(fm, "year");
      if (!g && it.genre) {
        if (!GEN.has(it.genre)) { bad++; }
        else { raw = setField(raw, "genre", it.genre, "duration"); g = it.genre; genre++; }
      }
      if (!y && /^\d{4}$/.test(String(it.year || ""))) { raw = setField(raw, "year", String(it.year), "album"); y = String(it.year); year++; }
      // 태그도 같이 맞춘다 — 국가·장르·연도 세 자리
      const next = [country, g, y].filter(Boolean).join(", ");
      if (next !== tags.join(", ")) raw = setField(raw, "tags", `[${next}]`, "lang");
    } else {
      if (fmValue(fm, "comment")) { skipped++; continue; }
      const c = String(it.comment || "").trim().replace(/\s+/g, " ");
      if (!c) { skipped++; continue; }
      if (/(습니다|합니다|해요|하죠|이죠)\.?$/.test(c)) { bad++; continue; } // 문체 규칙 위반은 버린다
      raw = setField(raw, "comment", c, "date");
      comment++;
    }
    fs.writeFileSync(p, raw);
  }
}
console.log(mode === "gy"
  ? `장르 ${genre} · 연도 ${year} · 어휘 밖 ${bad} · 파일 없음 ${missing}`
  : `코멘트 ${comment} · 건너뜀 ${skipped} · 문체 위반 ${bad} · 파일 없음 ${missing}`);
