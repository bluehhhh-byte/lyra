// 방향이 반대로 채워진 번역을 다시 만든다.
//
// 한국어 줄에 한국어 "번역"이 붙은 줄들이다 — 옮긴 게 아니라 같은 말을 고쳐 쓴
// 것이다. 아이유 <Dear my crazy soulmate>의 "다 잊어버려" → "전부 잊어버려"가
// 대표적이고, 코퍼스에 71곡 395줄이 있다. 번역 칸이 차 있어서 검사를 통과했고,
// lib/admin/needs.js의 translationFilled가 이제 그걸 잡는다.
//
// 두 단계로 나눈다. 초안과 반영 사이에 사람이 볼 자리를 두기 위해서다:
//
//   node scripts/fix-reversed-translations.mjs --draft [--limit N]
//     Gemini로 영어 번역을 만들어 저장소 밖 파일에 쌓는다. DB는 읽지도 쓰지도 않는다.
//   node scripts/fix-reversed-translations.mjs --apply
//     초안을 DB에 반영한다. 원문이 초안 작성 시점과 다르면 그 줄은 건너뛴다.
//
// 지키는 것:
//   - 원문(`line.en`)은 한 글자도 바뀌지 않는다. 바뀌면 그 곡을 통째로 버린다.
//   - `> ` 줄 중 방향이 반대인 것만 바꾼다. 멀쩡한 번역은 손대지 않는다.
//   - Gemini가 5xx나 무응답이면 재시도하지 않는다(CLAUDE.md). 그 곡을 건너뛴다.
//   - 배치 사이에 쉰다 — 무료티어는 총량보다 순간 속도에 먼저 걸린다.
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { FM, fmValue } from "../lib/admin/frontmatter.js";
import { parseLyrics } from "../lib/songs.js";
import { effectiveLang, wrongDirectionLines } from "../lib/admin/needs.js";
import { replaceTranslations } from "../lib/admin/song-meta.js";
import { geminiText } from "../lib/admin/gemini.js";

dotenv.config({ path: ".env.local", quiet: true });
const DRAFT = process.argv.includes("--draft");
const APPLY = process.argv.includes("--apply");
// 쓰기 없이 --apply와 같은 변환을 백업 파일에 돌려 불변식을 확인한다
const VERIFY = process.argv.includes("--verify");
const limitAt = process.argv.indexOf("--limit");
const LIMIT = limitAt > 0 ? Number(process.argv[limitAt + 1]) : Infinity;
// 저장소 밖 — 워킹 트리를 다른 작업과 공유한다
const OUT_DIR = path.resolve("..", "lyra-reversed-translations");
const DRAFT_FILE = path.join(OUT_DIR, "draft.json");
const BACKUP = path.join(OUT_DIR, "before");
const PAUSE_MS = 4000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadFromBackup() {
  return fs
    .readdirSync("songs")
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ slug: f.replace(/\.md$/, ""), raw: fs.readFileSync(path.join("songs", f), "utf8") }));
}

async function loadFromDb() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  return sql`select slug, raw from lyra_contents where kind='song' order by slug`;
}

// 고쳐야 할 줄을 곡별로 모은다.
function collect(rows) {
  const jobs = [];
  for (const row of rows) {
    const raw = String(row.raw || "").replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) continue;
    const [, fm, body] = m;
    const stanzas = parseLyrics(body);
    const lang = effectiveLang({ lang: fmValue(fm, "lang"), stanzas });
    const reversed = wrongDirectionLines(stanzas, lang).filter((l) => l.target === "en");
    if (!reversed.length) continue;
    jobs.push({
      slug: row.slug,
      title: fmValue(fm, "title"),
      artist: fmValue(fm, "artist"),
      lines: reversed.map((l) => ({ en: l.en, was: l.ko })),
    });
  }
  return jobs;
}

const prompt = (job) => `You are fixing translations on a Korean lyrics blog.

Song: "${job.title}" by ${job.artist}.

Each line below is a Korean lyric line. Its translation field was filled with
Korean — a rewrite, not a translation. Replace each with a natural ENGLISH
translation of the WHOLE line, including any English words already in it.

Rules:
- Output exactly ${job.lines.length} lines, in the same order, nothing else.
- One translation per line. No numbering, no quotes, no commentary.
- Translate naturally and poetically, preserving metaphor and tone.
- The output must be English. Never return Korean.

Lines:
${job.lines.map((l, i) => `${i + 1}. ${l.en}`).join("\n")}`;

const looksKorean = (t) => {
  const s = String(t || "").trim();
  const ko = (s.match(/[가-힣]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;
  return ko > 0 && ko * 2.5 >= en;
};

if (DRAFT) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY가 없습니다");
  // 기본은 백업 파일이다 — 진단에 DB 전량 조회를 쓰면 Neon 월 전송을 태운다.
  // 백업에 아직 안 떨어진 최신 곡까지 봐야 할 때만 --db.
  const source = process.argv.includes("--db") ? await loadFromDb() : loadFromBackup();
  const jobs = collect(source).slice(0, LIMIT);
  const total = jobs.reduce((a, j) => a + j.lines.length, 0);
  console.log(`대상 ${jobs.length}곡 ${total}줄 — 초안을 만든다\n`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const draft = [];
  let ok = 0, skipped = 0;
  for (const [i, job] of jobs.entries()) {
    process.stdout.write(`[${i + 1}/${jobs.length}] ${job.artist} — ${job.title} (${job.lines.length}줄) `);
    let text = "";
    try {
      text = await geminiText(key, prompt(job));
    } catch (error) {
      // 5xx·무응답은 재시도하지 않는다 — 모델 전체가 막힌 것이다
      console.log(`건너뜀: ${error.message}`);
      skipped++;
      await sleep(PAUSE_MS);
      continue;
    }
    const out = String(text || "").trim().split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
    if (out.length !== job.lines.length) {
      console.log(`건너뜀: ${job.lines.length}줄을 기대했는데 ${out.length}줄`);
      skipped++;
      await sleep(PAUSE_MS);
      continue;
    }
    const bad = out.findIndex(looksKorean);
    if (bad >= 0) {
      console.log(`건너뜀: ${bad + 1}번째가 여전히 한국어 — ${JSON.stringify(out[bad].slice(0, 30))}`);
      skipped++;
      await sleep(PAUSE_MS);
      continue;
    }
    draft.push({ ...job, lines: job.lines.map((l, n) => ({ ...l, now: out[n] })) });
    ok++;
    console.log("ok");
    await sleep(PAUSE_MS);
  }
  fs.writeFileSync(DRAFT_FILE, JSON.stringify(draft, null, 1));
  console.log(`\n초안 ${ok}곡 · 건너뜀 ${skipped}곡 → ${DRAFT_FILE}`);
  console.log("사람이 읽어 본 뒤 --apply로 반영한다.");
} else if (APPLY || VERIFY) {
  if (!fs.existsSync(DRAFT_FILE)) throw new Error(`초안이 없습니다: ${DRAFT_FILE} — 먼저 --draft`);
  const draft = JSON.parse(fs.readFileSync(DRAFT_FILE, "utf8"));
  const bySlug = new Map(draft.map((d) => [d.slug, d]));
  // --verify는 백업 파일에 대고 같은 변환을 돌려 불변식만 확인한다. 쓰지 않는다.
  // 이 경로는 나중에 사람 없이 DB에 쓰므로, 쓰기 전에 한 번은 돌려 봐야 한다.
  const rows = (VERIFY ? loadFromBackup() : await loadFromDb()).filter((r) => bySlug.has(r.slug));
  const sql = VERIFY ? null : (await import("@neondatabase/serverless")).neon(process.env.DATABASE_URL);
  if (!VERIFY) fs.mkdirSync(BACKUP, { recursive: true });

  let songs = 0, lines = 0, skipped = 0;
  for (const row of rows) {
    const job = bySlug.get(row.slug);
    const raw = String(row.raw).replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) continue;
    // 치환은 lib/admin/song-meta.js의 replaceTranslations가 한다 — 후렴 반복까지
    // 포함해 테스트가 걸려 있다(lib/retranslate.test.mjs).
    const { body: nextBody, changed, missed } = replaceTranslations(m[2], job.lines);
    skipped += missed.length;
    if (!changed) continue;

    const out = `---\n${m[1]}\n---\n${nextBody}`;
    // 원문은 한 글자도 바뀌지 않는다
    const originals = (text) => parseLyrics(text.match(FM)[2]).flatMap((s) => s.lines).map((l) => l.en).join(" ");
    if (originals(out) !== originals(raw)) {
      console.log(`${row.slug}: 원문이 바뀌었다 — 이 곡을 버린다`);
      continue;
    }
    if (!VERIFY) {
      fs.writeFileSync(path.join(BACKUP, `${row.slug}.md`), row.raw);
      await sql`update lyra_contents set raw = ${out}, updated_at = now() where kind='song' and slug = ${row.slug}`;
    }
    songs++;
    lines += changed;
    console.log(`${job.artist} — ${job.title}: ${changed}줄`);
  }
  console.log(`\n${VERIFY ? "(검증) 바뀔" : "반영"} ${songs}곡 ${lines}줄 · 건너뜀 ${skipped}줄${VERIFY ? "" : ` · 백업 ${BACKUP}`}`);
  if (VERIFY) {
    const want = draft.reduce((a, d) => a + d.lines.length, 0);
    console.log(
      lines >= want
        ? `초안 ${want}줄이 모두 자리를 찾았다 (후렴 반복까지 ${lines}줄)`
        : `⚠ 초안 ${want}줄 중 ${want - lines}줄이 원문과 맞지 않는다`,
    );
  }
  const secret = String(process.env.REVALIDATE_SECRET || "").trim();
  if (!VERIFY && secret && songs) {
    const res = await fetch("https://lyracyno.vercel.app/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": secret } });
    console.log(`캐시 무효화: HTTP ${res.status}`);
  }
} else {
  const jobs = collect(loadFromBackup());
  const total = jobs.reduce((a, j) => a + j.lines.length, 0);
  console.log(`방향이 반대인 번역: ${jobs.length}곡 ${total}줄\n`);
  for (const j of jobs.slice(0, 15)) {
    console.log(`${j.artist} — ${j.title} (${j.lines.length}줄)`);
    for (const l of j.lines.slice(0, 2)) console.log(`   "${l.en}"\n     현재: "${l.was}"`);
  }
  console.log("\n--draft로 초안을 만들고, --apply로 반영한다.");
}
