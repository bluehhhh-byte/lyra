// 섹션 없는 곡의 구조를 Claude가 직접 판정하는 파이프라인. Gemini를 부르지 않는다.
//
//   node scripts/restanza-claude.mjs export          # 남은 곡을 배치 파일로 내보낸다
//   node scripts/restanza-claude.mjs apply <json..>  # Claude가 쓴 판정을 검증하고 DB에 쓴다
//
// 상태·백업 폴더는 restanza-batch.mjs와 공유한다(../lyra-restanza-20260831).
// 이미 처리된 곡은 건너뛰므로 두 방식이 섞여도 곡 하나가 두 번 바뀌는 일은 없다.
//
// export가 만드는 batch-NNN.txt:
//   ## <slug> (<units>줄)
//   1. 첫 원문 줄
//   2. ...
// Claude는 같은 이름의 batch-NNN.json을 쓴다:
//   { "<slug>": [{"label":"Verse 1","count":4}, {"label":null,"count":2}, ...], ... }
//   - count 합은 반드시 그 곡의 줄 수. label은 "Intro"/"Verse 1"/"Pre-Chorus"/"Chorus"/
//     "Bridge"/"Outro"/"Interlude" 꼴 또는 null(헤더 없이 연 구분만).
//
// apply의 안전장치는 restanza-batch와 같다: count 합 검증, 쓰기 직전 원문 줄 순서
// 바이트 대조(다르면 건너뜀), 곡별 사전 백업, 곡마다 상태 저장, 끝에 revalidate 한 번.
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local", override: false, quiet: true });

const MODE = process.argv[2];
const STATE_DIR = path.resolve("..", "lyra-restanza-20260831");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const BACKUP_DIR = path.join(STATE_DIR, "before");
const CLAUDE_DIR = path.join(STATE_DIR, "claude");
const BATCH_SIZE = 40;

const DB = process.env.DATABASE_URL;
if (!DB) throw new Error("DATABASE_URL이 없습니다.");
const sql = neon(DB);

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const isHeader = (line) => /^\[[^\]]+\]\s*$/.test(line.trim());
const contentLines = (body) => body.split("\n").filter((l) => l.trim() && !isHeader(l)).map((l) => l.replace(/\s+$/, ""));

// restanzaBody와 같은 단위: 원문 줄 하나 + 그 아래 붙은 주석 줄들(>, +, //)
function toUnits(body) {
  const units = [];
  for (const line of body.split("\n")) {
    if (!line.trim() || isHeader(line)) continue;
    if (/^\s*(>|\+|\/\/)/.test(line) && units.length) units[units.length - 1].push(line);
    else units.push([line]);
  }
  return units;
}

async function loadTargets() {
  const rows = await sql`select slug, raw from lyra_contents where kind='song' order by slug`;
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : { done: {} };
  const targets = [];
  for (const row of rows) {
    const raw = row.raw.replace(/\r\n/g, "\n");
    const match = raw.match(FM);
    if (!match) continue;
    const [, fm, body] = match;
    if (/^(instrumental|lyrics_none):\s*true/m.test(fm)) continue;
    if (body.split("\n").some(isHeader)) continue;
    if (toUnits(body).length < 4) continue;
    if (state.done[row.slug]) continue;
    targets.push({ slug: row.slug, fm, body, raw });
  }
  return { targets, state };
}

if (MODE === "export") {
  const { targets } = await loadTargets();
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  let batch = 0;
  for (let start = 0; start < targets.length; start += BATCH_SIZE) {
    batch++;
    const chunk = targets.slice(start, start + BATCH_SIZE);
    const text = chunk
      .map((t) => {
        const units = toUnits(t.body);
        return `## ${t.slug} (${units.length}줄)\n${units.map((u, i) => `${i + 1}. ${u[0]}`).join("\n")}`;
      })
      .join("\n\n");
    fs.writeFileSync(path.join(CLAUDE_DIR, `batch-${String(batch).padStart(3, "0")}.txt`), text + "\n");
  }
  console.log(`남은 곡 ${targets.length} → 배치 파일 ${batch}개 (${CLAUDE_DIR})`);
  process.exit(0);
}

if (MODE === "apply") {
  const files = process.argv.slice(3);
  if (!files.length) throw new Error("적용할 batch-NNN.json 경로를 넘겨라.");
  const { targets, state } = await loadTargets();
  const bySlug = new Map(targets.map((t) => [t.slug, t]));
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  let applied = 0, skipped = 0, bad = 0;

  for (const file of files) {
    const plans = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [slug, groups] of Object.entries(plans)) {
      const t = bySlug.get(slug);
      if (!t) { skipped++; continue; } // 이미 처리됐거나 대상 아님
      const units = toUnits(t.body);
      const counts = (Array.isArray(groups) ? groups : []).map((g) => Math.floor(g?.count) || 0);
      if (counts.reduce((a, b) => a + b, 0) !== units.length || counts.some((c) => c < 1)) {
        console.log(`  ⚠ ${slug} — count 합 불일치 (${counts.reduce((a, b) => a + b, 0)} ≠ ${units.length}), 건너뜀`);
        bad++; continue;
      }
      let i = 0;
      const out = groups
        .map((g) => {
          const label = typeof g.label === "string" && /^[\w\s-]{2,20}$/.test(g.label.trim()) ? `[${g.label.trim()}]\n` : "";
          const lines = units.slice(i, i + g.count).map((u) => u.join("\n")).join("\n");
          i += g.count;
          return label + lines;
        })
        .join("\n\n");
      if (contentLines(out).join("\n") !== contentLines(t.body).join("\n")) {
        console.log(`  ⚠ ${slug} — 원문 줄 대조 불일치, 건너뜀`);
        bad++; continue;
      }
      fs.writeFileSync(path.join(BACKUP_DIR, `${slug}.md`), t.raw);
      const newRaw = `---\n${t.fm}\n---\n${out.trim()}\n`;
      await sql`update lyra_contents set raw = ${newRaw}, updated_at = now() where kind = 'song' and slug = ${slug}`;
      state.done[slug] = "applied-claude";
      save();
      applied++;
    }
  }
  console.log(`적용 ${applied} · 건너뜀 ${skipped} · 불일치 ${bad}`);

  if (applied > 0) {
    const secret = String(process.env.REVALIDATE_SECRET || "").trim();
    if (secret) {
      const response = await fetch("https://lyracyno.vercel.app/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": secret } });
      console.log(`캐시 무효화: HTTP ${response.status}`);
    }
  }
  process.exit(0);
}

throw new Error("모드를 지정해라: export | apply");
