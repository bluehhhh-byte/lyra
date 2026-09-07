// title_ko를 매핑 파일대로 DB에 반영한다.
//
// scripts/apply-title-ko.mjs와 하는 일은 같지만 대상이 다르다. 그쪽은
// songs/*.md 파일을 제목으로 찾아 고치는데, 지금 진실 공급원은 Neon이고 파일은
// 백업본이다. 제목은 서로 겹치기도 해서(Starry Night 두 곡, Goodbye 세 곡)
// 여기서는 slug로 찾는다.
//
// Gemini를 부르지 않는다 — 쿼터를 쓰지 않고, 무엇이 들어가는지 사람이 전부 보고
// 넣기 위해서다. 프론트매터의 title_ko 한 줄만 바꾸고 본문은 열지 않는다.
//
//   node scripts/apply-title-ko-db.mjs <매핑.json>           # dry-run
//   node scripts/apply-title-ko-db.mjs <매핑.json> --apply   # DB에 쓴다
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { FM, fmValue, setField } from "../lib/admin/frontmatter.js";

dotenv.config({ path: ".env.local", quiet: true });
const mapPath = process.argv[2];
if (!mapPath) throw new Error("매핑 JSON 경로가 필요합니다.");
const APPLY = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL);
// 저장소 밖 — 워킹 트리를 다른 작업과 공유한다
const BACKUP = path.resolve("..", "lyra-title-ko", "before");

// _로 시작하는 키는 주석이다
const mapping = Object.fromEntries(
  Object.entries(JSON.parse(fs.readFileSync(mapPath, "utf8"))).filter(([k]) => !k.startsWith("_")),
);

const rows = await sql`select slug, raw from lyra_contents where kind='song' order by slug`;
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const unknown = Object.keys(mapping).filter((slug) => !bySlug.has(slug));
if (unknown.length) {
  console.error(`매핑에 있는데 DB에 없는 slug ${unknown.length}건 — 중단합니다.`);
  for (const slug of unknown) console.error(`  - ${slug}`);
  process.exitCode = 2;
} else {
  if (APPLY) fs.mkdirSync(BACKUP, { recursive: true });
  let done = 0;
  let already = 0;
  for (const [slug, next] of Object.entries(mapping)) {
    const row = bySlug.get(slug);
    const raw = row.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) continue;
    const before = fmValue(m[1], "title_ko");
    if (before === next) { already++; continue; }

    const out = setField(raw, "title_ko", next, "title");
    if (out.match(FM)?.[2] !== m[2]) throw new Error(`${slug}: 본문이 바뀌었다 — 중단`);
    if (!fmValue(out.match(FM)[1], "title_ko")) throw new Error(`${slug}: title_ko를 넣지 못했다 — 중단`);

    console.log(`${fmValue(m[1], "title")}: "${before}" → "${next}"`);
    if (APPLY) {
      fs.writeFileSync(path.join(BACKUP, `${slug}.md`), row.raw);
      await sql`update lyra_contents set raw = ${out}, updated_at = now() where kind='song' and slug = ${slug}`;
    }
    done++;
  }

  console.log(`\n${APPLY ? "반영" : "(dry-run) 대상"} ${done}곡 · 이미 같음 ${already}곡`);
  if (APPLY && done) {
    const secret = String(process.env.REVALIDATE_SECRET || "").trim();
    if (secret) {
      const res = await fetch("https://lyracyno.vercel.app/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": secret } });
      console.log(`캐시 무효화: HTTP ${res.status}`);
    }
  }
}
