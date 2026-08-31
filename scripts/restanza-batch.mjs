// 섹션([Verse]·[Chorus]) 없는 곡 전체에 restanzaBody를 돌려 구조를 붙인다.
//
// CLAUDE.md의 대량 Gemini 원칙을 따른다: 서버리스가 아니라 로컬에서, lite 모델로,
// 호출 사이에 대기를 두고, 5xx·무응답은 재시도하지 않는다(대체 사슬은 gemini.js 몫).
//
// 기본은 dry-run이다 — 대상만 세고 아무것도 쓰지 않는다.
//   node scripts/restanza-batch.mjs                # 대상 목록
//   node scripts/restanza-batch.mjs --apply        # 실제 실행 (이어하기 지원)
//   node scripts/restanza-batch.mjs --apply --limit 5   # 시험 배치
//
// 안전장치:
// - 원문 줄 이중 검증: restanzaBody가 이미 줄 수를 검증하지만, 쓰기 직전에 빈 줄과
//   섹션 헤더를 뺀 줄의 "내용 순서"가 바이트 단위로 같은지 한 번 더 대조한다.
//   다르면 그 곡은 건너뛰고 기록만 남긴다. 원문 가사는 어떤 경우에도 변하지 않는다.
// - 곡별 백업: 고치기 전 raw를 상태 폴더에 저장한다. 되돌리기는 백업을 다시 쓰면 된다.
// - 이어하기: 곡 하나 끝날 때마다 상태 파일에 적는다. 끊겨도 다음 실행이 이어 간다.
// - 차단기: 연속 8곡 오류면 중단한다 — 쿼터 소진을 오류 850개로 확인할 이유가 없다.
// - 캐시: DB 직접 쓰기는 태그 무효화를 부르지 못하므로, 끝에 /api/revalidate를 한 번 부른다.
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { restanzaBody } from "../lib/admin/song-meta.js";

dotenv.config({ path: ".env.local", override: false, quiet: true });

const APPLY = process.argv.includes("--apply");
const limitIndex = process.argv.indexOf("--limit");
const LIMIT = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) || 0 : 0;
const PAUSE_MS = 3000;
const STATE_DIR = path.resolve("..", "lyra-restanza-20260831");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const BACKUP_DIR = path.join(STATE_DIR, "before");

const DB = process.env.DATABASE_URL;
const KEY = process.env.GEMINI_API_KEY;
if (!DB) throw new Error("DATABASE_URL이 없습니다.");
if (APPLY && !KEY) throw new Error("GEMINI_API_KEY가 없습니다.");
const sql = neon(DB);

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const isHeader = (line) => /^\[[^\]]+\]\s*$/.test(line.trim());
// 검증용: 빈 줄·섹션 헤더를 뺀 모든 줄(원문·번역·독음·해설)의 내용 순서
const contentLines = (body) => body.split("\n").filter((l) => l.trim() && !isHeader(l)).map((l) => l.replace(/\s+$/, ""));
const unitCount = (body) =>
  body.split("\n").filter((l) => l.trim() && !isHeader(l) && !/^\s*(>|\+|\/\/)/.test(l) && !/^[🗨✏]/.test(l.trim())).length;

const rows = await sql`select slug, raw from lyra_contents where kind='song' order by slug`;
const targets = [];
for (const row of rows) {
  const raw = row.raw.replace(/\r\n/g, "\n");
  const match = raw.match(FM);
  if (!match) continue;
  const [, fm, body] = match;
  if (/^(instrumental|lyrics_none):\s*true/m.test(fm)) continue;
  if (body.split("\n").some(isHeader)) continue;
  if (unitCount(body) < 4) continue;
  targets.push({ slug: row.slug, fm, body, raw });
}

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : { done: {} };
const remaining = targets.filter((t) => !state.done[t.slug]);
console.log(`곡 ${rows.length} · 대상 ${targets.length} · 처리됨 ${Object.keys(state.done).length} · 남음 ${remaining.length}`);

if (!APPLY) {
  console.log("\n(dry-run) 처음 20곡:");
  for (const t of remaining.slice(0, 20)) console.log(`  - ${t.slug} (${unitCount(t.body)}줄)`);
  console.log("\n실행: node scripts/restanza-batch.mjs --apply [--limit N]");
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
const title = (fm) => (fm.match(/^title:\s*(.*)$/m) || [])[1] || "";
const artist = (fm) => (fm.match(/^artist:\s*(.*)$/m) || [])[1] || "";

let applied = 0, unchanged = 0, mismatch = 0, errors = 0, streak = 0;
const batch = LIMIT ? remaining.slice(0, LIMIT) : remaining;
for (const [index, t] of batch.entries()) {
  const label = `[${index + 1}/${batch.length}] ${t.slug}`;
  let outcome;
  try {
    const result = await restanzaBody({ title: title(t.fm), artist: artist(t.fm), bodyText: t.body, key: KEY });
    if (!result) {
      outcome = "unchanged"; unchanged++; streak = 0;
      console.log(`${label} — 구조 판정 없음, 그대로 둠`);
    } else if (contentLines(result).join("\n") !== contentLines(t.body).join("\n")) {
      outcome = "mismatch"; mismatch++; streak = 0;
      console.log(`${label} — ⚠ 내용 줄이 달라져 건너뜀`);
    } else {
      fs.writeFileSync(path.join(BACKUP_DIR, `${t.slug}.md`), t.raw);
      const newRaw = `---\n${t.fm}\n---\n${result.trim()}\n`;
      await sql`update lyra_contents set raw = ${newRaw}, updated_at = now() where kind = 'song' and slug = ${t.slug}`;
      outcome = "applied"; applied++; streak = 0;
      const sections = result.split("\n").filter(isHeader).length;
      console.log(`${label} — 섹션 ${sections}개 부여`);
    }
  } catch (error) {
    outcome = "error"; errors++; streak++;
    console.log(`${label} — 오류: ${String(error).slice(0, 120)}`);
    if (streak >= 8) { console.log("연속 오류 8회 — 쿼터 소진으로 보고 중단한다. 나중에 다시 실행하면 이어 간다."); save(); break; }
  }
  state.done[t.slug] = outcome;
  save();
  if (index < batch.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
}

console.log(`\n결과: 부여 ${applied} · 그대로 ${unchanged} · 검증 불일치 ${mismatch} · 오류 ${errors}`);
console.log(`백업: ${BACKUP_DIR}`);

if (applied > 0) {
  const secret = String(process.env.REVALIDATE_SECRET || "").trim();
  if (!secret) console.log("REVALIDATE_SECRET 없음 — 캐시는 6시간 TTL로 자연 갱신된다.");
  else {
    const response = await fetch("https://lyracyno.vercel.app/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": secret } });
    console.log(`캐시 무효화: HTTP ${response.status}`);
  }
}
