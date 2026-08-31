// 일회성 — DB 전곡의 비표준 장르(스토어 로케일 단어)를 영어 어휘로 정규화한다.
// genre: 프론트매터와 tags의 장르 슬롯을 함께 고친다. 가사 본문은 건드리지 않는다.
// 규칙: capGenre(별칭 사전). 예외: 일본 태그 곡의 "ロック"은 Rock이 아니라 J-Rock.
// 실행: node scripts/fix-genres.mjs (dry-run) · --apply 실제 반영
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { capGenre, genreIssue, COUNTRY_TAGS } from "../lib/genre.js";

dotenv.config({ path: ".env.local", quiet: true });
const APPLY = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL);
const BACKUP = path.resolve("..", "lyra-restanza-20260831", "genre-before");

// 별칭으로도 못 정하는 개별 판단 — 곡을 아는 사람이 정한 값
const OVERRIDE = new Map([
  ["foals-spanish-sahara", "Post-Rock"], // 장르 없음 — 포스트록 대표곡
  ["los-indios-tabajaras-always-in-my-heart", "Jazz"], // Latin — 기타 연주곡
]);

const rows = await sql`select slug, raw from lyra_contents where kind='song' order by slug`;
let changed = 0;
if (APPLY) fs.mkdirSync(BACKUP, { recursive: true });
for (const r of rows) {
  const raw = r.raw.replace(/\r\n/g, "\n");
  const gm = raw.match(/^genre:\s*(.*)$/m);
  if (!gm) continue;
  const old = gm[1].trim();
  let next = OVERRIDE.get(r.slug) ?? capGenre(old);
  const tagsLine = (raw.match(/^tags:\s*\[(.*)\]/m) || [, ""])[1];
  const tags = tagsLine.split(",").map((t) => t.trim()).filter(Boolean);
  if (old === "ロック" && tags.includes("일본")) next = "J-Rock"; // 일본 곡의 범용 록
  if (next === old) continue;

  // tags의 장르 슬롯(국가·연도가 아닌 항목)도 같이 정규화
  const newTags = tags.map((t) =>
    COUNTRY_TAGS.includes(t) || /^\d{4}s?$/.test(t) ? t : (t === old ? next : capGenre(t))
  );
  let newRaw = raw.replace(/^genre:\s*.*$/m, `genre: ${next}`);
  if (tags.length) newRaw = newRaw.replace(/^tags:\s*\[.*\]/m, `tags: [${newTags.join(", ")}]`);

  console.log(`${r.slug}: "${old}" → "${next}"${genreIssue(next) ? `  (잔여: ${genreIssue(next)})` : ""}`);
  if (APPLY) {
    fs.writeFileSync(path.join(BACKUP, `${r.slug}.md`), r.raw);
    await sql`update lyra_contents set raw = ${newRaw}, updated_at = now() where kind='song' and slug = ${r.slug}`;
  }
  changed++;
}
console.log(`\n${APPLY ? "반영" : "(dry-run) 대상"} ${changed}곡`);
if (APPLY && changed) {
  const secret = String(process.env.REVALIDATE_SECRET || "").trim();
  if (secret) {
    const res = await fetch("https://lyracyno.vercel.app/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": secret } });
    console.log(`캐시 무효화: HTTP ${res.status}`);
  }
}
