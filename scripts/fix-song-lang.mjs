// frontmatter의 lang이 가사와 어긋난 곡을 고친다. 프론트매터 한 줄만 바꾸고
// 본문은 열지 않는다 — Gemini도 부르지 않는다.
//
// 왜 필요한가: 아이유 <Dear my crazy soulmate>는 가사 44줄 중 27줄이 한국어인데
// lang: en으로 등록돼 있었고, 그 한 글자 때문에 곡 전체가 번역 검사 밖에 있었다.
// 판정은 effectiveLang이 가사를 보도록 고쳤지만, 선언을 믿는 다른 곳(언어 필터,
// 통계)은 여전히 틀린 값을 본다.
//
// 왜 자동으로 다 고치지 않는가: "한국어 줄이 많다"가 곧 "한국 곡"은 아니다.
// 원문 칸에 한국어 번역이 잘못 들어간 외국곡도 똑같이 보인다 — Kent <747>,
// Lamp <恋人へ>, The Vines <Country Yard>가 그렇다. 그 넷에 lang: ko를 넣으면
// 스웨덴 곡이 한국 곡이 된다. 그래서 근거가 둘 다 있을 때만 고친다:
//   (1) 가사가 실제로 한국어를 싣고 있다 (carriesKorean, 한국어 원문 3줄 이상)
//   (2) 사람이 넣은 메타데이터가 한국 곡이라고 말한다
//       — tags에 '한국', 또는 장르가 K-Pop, 또는 아티스트명이 한글
// 둘 중 하나만 맞으면 고치지 않고 "확인 필요"로 남긴다.
//
//   node scripts/fix-song-lang.mjs            # dry-run (백업 파일을 읽는다)
//   node scripts/fix-song-lang.mjs --apply    # DB에 쓴다
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { FM, fmValue, setField } from "../lib/admin/frontmatter.js";
import { parseLyrics } from "../lib/songs.js";
import { carriesKorean, metadataSaysKorean } from "../lib/admin/needs.js";

dotenv.config({ path: ".env.local", quiet: true });
const APPLY = process.argv.includes("--apply");
// 저장소 밖 — 워킹 트리를 다른 작업과 공유한다
const BACKUP = path.resolve("..", "lyra-song-lang", "before");

async function loadSongs() {
  if (!APPLY)
    return fs
      .readdirSync("songs")
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ slug: f.replace(/\.md$/, ""), raw: fs.readFileSync(path.join("songs", f), "utf8") }));
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  return sql`select slug, raw from lyra_contents where kind='song' order by slug`;
}

const rows = await loadSongs();
const planned = [];
const review = [];

for (const row of rows) {
  const raw = String(row.raw || "").replace(/\r\n/g, "\n");
  const m = raw.match(FM);
  if (!m) continue;
  const [, fm, body] = m;
  const lang = fmValue(fm, "lang");
  if (lang === "ko") continue;
  if (!carriesKorean(parseLyrics(body))) continue;

  const why = metadataSaysKorean({ tags: fmValue(fm, "tags"), artist: fmValue(fm, "artist") });
  const entry = { slug: row.slug, artist: fmValue(fm, "artist"), title: fmValue(fm, "title"), lang, tags: fmValue(fm, "tags"), why, raw };
  (why ? planned : review).push(entry);
}

console.log(`${APPLY ? "DB" : "백업"} 곡 ${rows.length}\n`);
console.log(`고칠 곡 ${planned.length} — lang → ko`);
for (const p of planned) console.log(`   [${p.lang}] ${p.artist} — ${p.title}  (${p.why})`);

console.log(`\n고치지 않는 곡 ${review.length} — 가사는 한국어인데 메타데이터는 외국곡이다.`);
console.log("   원문 칸에 번역이 들어갔을 가능성이 높다. 사람이 봐야 한다.");
for (const r of review) console.log(`   [${r.lang}] ${r.artist} — ${r.title}\n      tags: ${r.tags}`);

if (!APPLY) {
  console.log("\n(dry-run) --apply를 주면 DB에 쓴다.");
} else {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  fs.mkdirSync(BACKUP, { recursive: true });
  let done = 0;
  for (const p of planned) {
    const out = setField(p.raw, "lang", "ko", "duration");
    // 본문은 한 글자도 바뀌지 않는다 — 원문 가사는 절대 건드리지 않는다
    if (out.match(FM)?.[2] !== p.raw.replace(/\r\n/g, "\n").match(FM)[2])
      throw new Error(`${p.slug}: 본문이 바뀌었다 — 중단`);
    if (fmValue(out.match(FM)[1], "lang") !== "ko") throw new Error(`${p.slug}: lang을 넣지 못했다 — 중단`);
    fs.writeFileSync(path.join(BACKUP, `${p.slug}.md`), p.raw);
    await sql`update lyra_contents set raw = ${out}, updated_at = now() where kind='song' and slug = ${p.slug}`;
    done++;
  }
  console.log(`\n반영 ${done}곡 · 백업 ${BACKUP}`);
  const secret = String(process.env.REVALIDATE_SECRET || "").trim();
  if (secret && done) {
    const res = await fetch("https://lyracyno.vercel.app/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": secret } });
    console.log(`캐시 무효화: HTTP ${res.status}`);
  }
}
