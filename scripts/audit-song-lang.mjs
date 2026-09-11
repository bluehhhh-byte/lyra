// lang 오기입 진단 — 선언된 lang과 실제 가사가 어긋난 곡을 찾는다.
//
// 아이유 <Dear my crazy soulmate>는 가사 44줄 중 27줄이 한국어인데 lang: en으로
// 등록돼 있었다. needsEn이 lang === "ko"만 보던 시절 그 곡은 통째로 검사 밖이었다.
// 판정 자체는 effectiveLang이 가사를 보게 고쳤지만, frontmatter가 틀린 것은
// 그대로 남는다 — 다른 곳(언어 필터·통계)이 여전히 선언을 믿는다.
//
// 고치기 전에 사람이 봐야 하는 이유: "한국어 줄이 많다"가 곧 "한국 곡"은 아니다.
// 원문 칸에 번역이 잘못 들어간 곡도 같은 모습이 된다(Kent <747>, Lamp <恋人へ>).
// 그래서 이 스크립트는 쓰지 않고 근거만 모은다.
//
// 기본은 songs/*.md 백업을 읽는다. 진단에 DB를 쓸 이유가 없다 — 전량 조회 한 번이
// 수 MB고, Neon Free의 월 전송 5GB를 태우면 모든 읽기가 402가 된다(2026-08-22,
// 그리고 2026-09-12에 다시). 백업에 없는 최신 곡까지 봐야 할 때만 --db를 준다.
//
//   node scripts/audit-song-lang.mjs [--json <경로>] [--db]
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { FM, fmValue } from "../lib/admin/frontmatter.js";
import { parseLyrics } from "../lib/songs.js";
import { carriesKorean, effectiveLang, wrongDirectionLines } from "../lib/admin/needs.js";

dotenv.config({ path: ".env.local", quiet: true });
const jsonAt = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : "";
const useDb = process.argv.includes("--db");

async function loadSongs() {
  if (!useDb)
    return fs
      .readdirSync("songs")
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ slug: f.replace(/\.md$/, ""), raw: fs.readFileSync(path.join("songs", f), "utf8") }));
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  return sql`select slug, raw from lyra_contents where kind='song' order by slug`;
}

const isKoreanText = (t) => {
  const s = String(t || "").trim();
  const ko = (s.match(/[가-힣]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;
  return ko > 0 && ko * 2.5 >= en;
};

const rows = await loadSongs();
const report = [];

for (const row of rows) {
  const raw = String(row.raw || "").replace(/\r\n/g, "\n");
  const m = raw.match(FM);
  if (!m) continue;
  const [, fm, body] = m;
  const lang = fmValue(fm, "lang");
  const stanzas = parseLyrics(body);
  const song = { lang, stanzas };
  if (lang === "ko" || !carriesKorean(stanzas)) continue;

  const lines = stanzas.flatMap((s) => s.lines);
  const koOriginals = lines.filter((l) => isKoreanText(l.en));
  // 원문 칸에 번역이 들어간 곡을 가르는 근거:
  //   translated  — 한국어 원문 줄에 `>` 번역이 붙어 있다(정상적인 한국 곡의 모습)
  //   bare        — 번역 없이 한국어만 있다(원문 자리에 번역이 들어갔을 수 있다)
  //   glued       — 원문 한 줄에 외국어와 한국어가 같이 들어 있다
  const bare = koOriginals.filter((l) => !String(l.ko || "").trim() && !l.koMerged);
  const glued = koOriginals.filter((l) => /[A-Za-z]{2,}/.test(l.en) && /[가-힣]/.test(l.en));
  report.push({
    slug: row.slug,
    artist: fmValue(fm, "artist"),
    title: fmValue(fm, "title"),
    lang,
    effective: effectiveLang(song),
    tags: fmValue(fm, "tags"),
    lines: lines.length,
    koOriginals: koOriginals.length,
    bare: bare.length,
    glued: glued.length,
    reversed: wrongDirectionLines(stanzas, "ko").length,
    sample: koOriginals.slice(0, 2).map((l) => ({ en: l.en, ko: l.ko || "" })),
  });
}

report.sort((a, b) => b.koOriginals - a.koOriginals);
console.log(`${useDb ? "DB" : "백업"} 곡 ${rows.length} · lang이 ko가 아닌데 한국어를 싣고 있는 곡 ${report.length}\n`);
for (const r of report) {
  const flag = r.bare === r.koOriginals ? " ⚠ 번역 없는 한국어 원문뿐" : r.glued ? " ⚠ 원문에 번역이 붙어 있음" : "";
  console.log(`[${r.lang}] ${r.artist} — ${r.title}`);
  console.log(`   ${r.slug}`);
  console.log(`   가사 ${r.lines}줄 · 한국어 원문 ${r.koOriginals} (번역없음 ${r.bare} · 혼입 ${r.glued}) · 방향반대 ${r.reversed}${flag}`);
  console.log(`   tags: ${r.tags}`);
  for (const s of r.sample) console.log(`     "${s.en}"${s.ko ? `  →  "${s.ko}"` : "  (번역 없음)"}`);
  console.log("");
}
if (jsonAt) {
  fs.writeFileSync(jsonAt, JSON.stringify(report, null, 1));
  console.log(`→ ${jsonAt}`);
}
