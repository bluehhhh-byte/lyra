// 일회성 — 원어 칸에 섞여 들어간 한글 독음을 독음 칸으로 돌려놓는다.
//
// 옛 등록분 일부는 title/artist 칸 자체에 독음이 붙어 있다("ザクロ 석류",
// "鹿の一族(사슴의 일족)"). 독음은 title_ko/artist_ko에도 이미 같은 값이 있어서,
// 곡 페이지는 제목 아래 같은 말을 한 번 더 찍고 캐러셀은 "ザクロ 석류 (석류)"가
// 된다. 원어 칸에는 원어만 남긴다 — 독음 칸의 값은 건드리지 않는다.
//
// 안전장치: 지울 수 있는 건 독음 칸의 값과 글자가 정확히 겹치는 부분뿐이고,
// 남는 원어에 일본어·한자가 없으면 그 곡은 건너뛴다. 본문은 열지 않는다.
//
// 실행: node scripts/split-reading-fields.mjs (dry-run) · --apply 실제 반영
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { FM, fmValue, setField } from "../lib/admin/frontmatter.js";

dotenv.config({ path: ".env.local", quiet: true });
const APPLY = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL);
// 저장소 밖 — 워킹 트리를 다른 작업과 공유한다
const BACKUP = path.resolve("..", "lyra-reading-split", "before");

const JA = /[぀-ヿ㐀-鿿]/;
const HANGUL = /[가-힣]/;
const squeeze = (value) => value.replace(/\s+/g, " ").trim();

// 자동으로 도려낼 수 없는 표기 — 괄호가 이름 한가운데 있어 독음 칸의 값과 글자가
// 이어지지 않는다("千と千尋の神隱し(센과 치히로의 행방불명) OST" vs "센과 … OST").
const OVERRIDE = new Map([
  ["千と千尋の神隱し-센과-치히로의-행방불명-ost-いつも何度でも", { artist: "千と千尋の神隱し OST" }],
]);

// 원어 칸에서 독음과 겹치는 부분만 도려낸다. 괄호로 감싼 형태("(사슴의 일족)")와
// 공백으로 이어 붙인 형태("ザクロ 석류")를 모두 받는다.
function stripReading(native, reading) {
  if (!reading || !HANGUL.test(native)) return native;
  const escaped = reading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = squeeze(
    native
      .replace(new RegExp(`\\s*[(\\[]\\s*${escaped}\\s*[)\\]]`), " ")
      .replace(new RegExp(`\\s*${escaped}`), " "),
  );
  // 독음이 여러 낱말이면 원어 칸의 표기가 조금 다를 수 있다(공백·조사). 그때는
  // 손대지 않는다 — 어중간하게 지우느니 사람이 보는 편이 낫다.
  if (!stripped || !JA.test(stripped) || HANGUL.test(stripped)) return native;
  return stripped;
}

const rows = await sql`select slug, raw from lyra_contents where kind='song' order by slug`;
if (APPLY) fs.mkdirSync(BACKUP, { recursive: true });

let done = 0;
const skipped = [];
for (const row of rows) {
  const raw = row.raw.replace(/\r\n/g, "\n");
  const m = raw.match(FM);
  if (!m) continue;
  const fm = m[1];
  const edits = [];
  for (const [nativeKey, readingKey] of [["title", "title_ko"], ["artist", "artist_ko"]]) {
    const native = fmValue(fm, nativeKey);
    const reading = fmValue(fm, readingKey);
    if (!reading || !HANGUL.test(native) || !JA.test(native)) continue;
    const next = OVERRIDE.get(row.slug)?.[nativeKey] ?? stripReading(native, reading);
    if (next === native) {
      skipped.push(`${row.slug} · ${nativeKey}="${native}" (독음 "${reading}"과 글자가 어긋남)`);
      continue;
    }
    edits.push([nativeKey, native, next]);
  }
  if (!edits.length) continue;

  let out = raw;
  for (const [key, , next] of edits) out = setField(out, key, next);
  if (out.match(FM)?.[2] !== m[2]) throw new Error(`${row.slug}: 본문이 바뀌었다 — 중단`);

  console.log(row.slug);
  for (const [key, before, after] of edits) console.log(`   ${key}: "${before}" → "${after}"`);
  if (APPLY) {
    fs.writeFileSync(path.join(BACKUP, `${row.slug}.md`), row.raw);
    await sql`update lyra_contents set raw = ${out}, updated_at = now() where kind='song' and slug = ${row.slug}`;
  }
  done++;
}

console.log(`\n${APPLY ? "반영" : "(dry-run) 대상"} ${done}곡 · 손대지 않음 ${skipped.length}건`);
for (const line of skipped) console.log(`  - ${line}`);
if (APPLY && done) {
  const secret = String(process.env.REVALIDATE_SECRET || "").trim();
  if (secret) {
    const res = await fetch("https://lyracyno.vercel.app/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": secret } });
    console.log(`캐시 무효화: HTTP ${res.status}`);
  }
}
