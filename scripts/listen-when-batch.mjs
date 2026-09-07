// listen_when 배치 채우기 — 기존 등록곡용.
//
// 커버 카드의 "이런 순간에" 장면 한 줄. 신규 곡은 computeAuto(Gemini)가 만들지만,
// 기존 950여 곡은 Claude가 곡별로 써서 채웠다. 흐름:
//
//   node scripts/listen-when-batch.mjs --dump    # 대상 곡을 NDJSON으로 내보낸다
//   (Claude가 ../lyra-listen-when/phrases/batch-*.json 에 {slug: 문구}를 쓴다)
//   node scripts/listen-when-batch.mjs           # dry-run — 무엇이 들어갈지 보여준다
//   node scripts/listen-when-batch.mjs --apply   # DB 반영 + 캐시 무효화
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { FM, fmValue, setField } from "../lib/admin/frontmatter.js";
import { cleanListenWhen } from "../lib/listen-when.js";

dotenv.config({ path: ".env.local", quiet: true });
const MODE = process.argv.includes("--dump") ? "dump" : process.argv.includes("--apply") ? "apply" : "dry";
const sql = neon(process.env.DATABASE_URL);
// 저장소 밖 — 워킹 트리를 다른 작업과 공유한다
const WORK = path.resolve("..", "lyra-listen-when");
const BACKUP = path.join(WORK, "before");

const rows = await sql`select slug, raw from lyra_contents where kind='song' order by slug`;
const songs = rows.map((row) => {
  const raw = row.raw.replace(/\r\n/g, "\n");
  const m = raw.match(FM);
  return { slug: row.slug, raw, fm: m?.[1] || "", body: m?.[2] || "" };
});
const missing = songs.filter((song) => !fmValue(song.fm, "listen_when"));

if (MODE === "dump") {
  // 곡당 한 줄(NDJSON) — 생성할 때 조각으로 읽기 위해서다.
  const lines = missing.map((song) => {
    const v = (key) => fmValue(song.fm, key);
    const lang = v("lang");
    // 근거는 한국어 쪽 가사다: 한국 곡은 원문(일반 줄), 외국 곡은 번역(`> ` 줄)
    const koLines = song.body
      .split("\n")
      .filter((line) => (lang === "ko" ? /^[^>+/\[\s]/.test(line) : /^>\s/.test(line)))
      .map((line) => line.replace(/^>\^?\d*\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 8);
    return JSON.stringify({
      slug: song.slug, title: v("title"), title_ko: v("title_ko"), artist: v("artist"),
      genre: v("genre"), emotion: v("emotion"), keywords: v("keywords"),
      comment: v("comment"), lyrics: koLines,
    });
  });
  fs.mkdirSync(path.join(WORK, "phrases"), { recursive: true });
  fs.writeFileSync(path.join(WORK, "songs.ndjson"), lines.join("\n") + "\n", "utf8");
  console.log(`대상 ${lines.length}곡 → ${path.join(WORK, "songs.ndjson")}`);
  process.exit(0);
}

// dry/apply — phrases/*.json 을 합쳐 반영한다
const phraseDir = path.join(WORK, "phrases");
const phrases = new Map();
for (const file of fs.existsSync(phraseDir) ? fs.readdirSync(phraseDir).filter((f) => f.endsWith(".json")) : []) {
  const batch = JSON.parse(fs.readFileSync(path.join(phraseDir, file), "utf8"));
  for (const [slug, line] of Object.entries(batch)) phrases.set(slug, line);
}
console.log(`문구 ${phrases.size}건 로드`);

if (MODE === "apply") fs.mkdirSync(BACKUP, { recursive: true });
let done = 0;
const bad = [];
for (const song of missing) {
  const line = cleanListenWhen(phrases.get(song.slug));
  if (!line) {
    if (phrases.has(song.slug)) bad.push(`${song.slug}: 규칙 위반 — "${phrases.get(song.slug)}"`);
    continue;
  }
  // 모든 곡에 있는 tags를 닻으로 쓴다 — emotion은 lyrics_none 곡에 없다
  const next = setField(song.raw, "listen_when", line, "tags");
  if (next === song.raw) { bad.push(`${song.slug}: tags 닻 없음`); continue; }
  if (next.match(FM)?.[2] !== song.body) throw new Error(`${song.slug}: 본문이 바뀌었다 — 중단`);
  if (MODE === "apply") {
    fs.writeFileSync(path.join(BACKUP, `${song.slug}.md`), song.raw);
    await sql`update lyra_contents set raw = ${next}, updated_at = now() where kind='song' and slug = ${song.slug}`;
  } else if (done < 5) console.log(`${song.slug}: ${line}`);
  done++;
}
console.log(`\n${MODE === "apply" ? "반영" : "(dry-run) 대상"} ${done}곡 · 문제 ${bad.length}건 · 문구 없음 ${missing.length - done - bad.length}곡`);
for (const line of bad) console.log(`  - ${line}`);
if (MODE === "apply" && done) {
  const secret = String(process.env.REVALIDATE_SECRET || "").trim();
  if (secret) {
    const res = await fetch("https://lyracyno.vercel.app/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": secret } });
    console.log(`캐시 무효화: HTTP ${res.status}`);
  }
}
