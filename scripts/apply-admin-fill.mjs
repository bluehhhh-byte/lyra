// 관리자 '누락 항목 보정'·'커버 검토'를 Claude가 채운 결과를 반영한다.
//   node scripts/apply-admin-fill.mjs title <파일...>   한글 제목
//   node scripts/apply-admin-fill.mjs cover <파일...>   커버 URL (실제로 열리는지 확인 후 기록)
//
// 커버는 URL이 살아 있고 이미지인지 여기서 한 번 더 확인한다 — 죽은 링크를 넣으면
// 화면에 깨진 이미지가 남고, 그건 커버가 없는 것보다 나쁘다.
// 출처는 data/artwork-backfill-audit.json에 남긴다.
import fs from "fs";
import { FM, fmValue, setField } from "../lib/admin/frontmatter.js";

const mode = process.argv[2];
const files = process.argv.slice(3);
const AUDIT = "data/artwork-backfill-audit.json";

const readItems = (f) => {
  try { return JSON.parse(fs.readFileSync(f, "utf8")).items || []; }
  catch { console.log(`  읽기 실패: ${f}`); return []; }
};

async function checkImage(url) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Lyra/1.0 (personal music archive)" } });
    if (!r.ok) return `HTTP ${r.status}`;
    const type = r.headers.get("content-type") || "";
    if (!/^image\//.test(type)) return `이미지 아님 (${type.slice(0, 30)})`;
    const len = Number(r.headers.get("content-length") || 0);
    if (len && len < 3000) return `너무 작음 (${len}B)`;
    return "";
  } catch (e) { return `연결 실패: ${e.message.slice(0, 40)}` };
}

if (mode === "title") {
  let done = 0, skipped = 0;
  for (const f of files) for (const it of readItems(f)) {
    const p = `songs/${it.slug}.md`;
    if (!fs.existsSync(p)) { skipped++; continue; }
    const raw = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    const fm = raw.match(FM)?.[1];
    const ko = String(it.title_ko || "").trim();
    if (!fm || !ko || fmValue(fm, "title_ko")) { skipped++; continue; }
    fs.writeFileSync(p, setField(raw, "title_ko", ko, "title"));
    done++;
  }
  console.log(`한글 제목 ${done} · 건너뜀 ${skipped}`);
} else {
  const audit = (() => { try { return JSON.parse(fs.readFileSync(AUDIT, "utf8")); } catch { return { items: [] }; } })();
  audit.items = audit.items || [];
  let ok = 0, dead = 0, empty = 0, skipped = 0;
  for (const f of files) for (const it of readItems(f)) {
    const url = String(it.artwork || "").trim();
    if (!url) { empty++; continue; }
    const p = `songs/${it.slug}.md`;
    if (!fs.existsSync(p)) { skipped++; continue; }
    let raw = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    const fm = raw.match(FM)?.[1];
    if (!fm || (fmValue(fm, "artwork") || "").startsWith("https")) { skipped++; continue; }
    if (!/^https:\/\//.test(url)) { dead++; console.log(`  ✗ ${it.slug}: https 아님`); continue; }
    const why = await checkImage(url);
    if (why) { dead++; console.log(`  ✗ ${it.slug}: ${why}`); continue; }
    raw = setField(raw, "artwork", url, "year");
    if (it.album && !fmValue(fm, "album")) raw = setField(raw, "album", String(it.album), "artist_ko");
    if (/^\d{4}$/.test(String(it.year || "")) && !fmValue(fm, "year")) raw = setField(raw, "year", String(it.year), "album");
    fs.writeFileSync(p, raw);
    audit.items.push({
      slug: it.slug, provider: "web", status: it.confidence === "high" ? "exact" : "acceptable_version",
      artwork: url, sourcePage: it.source || "", action: "filled", at: new Date().toISOString(),
    });
    ok++;
  }
  audit.at = new Date().toISOString();
  fs.writeFileSync(AUDIT, JSON.stringify(audit, null, 1));
  console.log(`커버 ${ok} · 링크 불량 ${dead} · 값 없음 ${empty} · 건너뜀 ${skipped}`);
}
