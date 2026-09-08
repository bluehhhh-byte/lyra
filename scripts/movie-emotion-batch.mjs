// 영화 감정 백필 — 브리프 §10 Phase 3 (승인: "백필은 둘 다").
//
// 영화가 감정 궤도에 들어가게 되면서 기존 50편에는 감정이 없다. Gemini lite가
// 초안을 만들고(둘 중 하나), 사람이 표를 검토·수정한 뒤(둘 중 둘) 반영한다.
// 근거는 소유자가 직접 쓴 감상 코멘트다 — 줄거리가 아니라 '이 기록의 감정'을
// 고르게 한다. 확신이 없으면 빈 값을 돌려받고 그대로 비워 둔다(모르면 모른다).
//
//   node scripts/movie-emotion-batch.mjs --dump    # 초안 생성 → 검토 파일 작성
//   node scripts/movie-emotion-batch.mjs --apply   # 검토 파일대로 DB에 쓴다
//
// 무료 티어 원칙: 로컬 스크립트 · lite 모델 · 배치 간 대기 · 5xx 재시도 없음
// (대체 사슬은 lib/admin/gemini.js가 처리).
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { FM, fmValue, setField } from "../lib/admin/frontmatter.js";
import { geminiText, GEMINI_LITE_MODEL } from "../lib/admin/gemini.js";
import { EMOTIONS, parseEmotion } from "../lib/keywords.js";

dotenv.config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
const MODE = process.argv.includes("--apply") ? "apply" : "dump";
// 저장소 밖 — 워킹 트리를 다른 세션과 공유한다
const WORKDIR = path.resolve("..", "lyra-movie-emotion");
const PROPOSALS = path.join(WORKDIR, "proposals.json");
const BACKUP = path.join(WORKDIR, "before");
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

const rows = await sql`select slug, raw from lyra_contents where kind='movie' order by slug`;
const movies = rows
  .map((row) => {
    const raw = row.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return null;
    const value = (key) => fmValue(m[1], key);
    return {
      slug: row.slug,
      raw: row.raw,
      title: value("title_ko") || value("title"),
      year: value("year"),
      genre: value("genre"),
      themes: value("themes"),
      rating: value("rating"),
      comment: value("comment"),
      emotion: parseEmotion(value("emotion")),
    };
  })
  .filter(Boolean);

const targets = movies.filter((movie) => !movie.emotion);
console.log(`영화 ${movies.length}편 · 감정 없음 ${targets.length}편`);

if (MODE === "dump") {
  const key = String(process.env.GEMINI_API_KEY || "").trim();
  if (!key) throw new Error("GEMINI_API_KEY가 없습니다.");
  fs.mkdirSync(WORKDIR, { recursive: true });

  const proposals = [];
  const BATCH = 10;
  for (let start = 0; start < targets.length; start += BATCH) {
    const batch = targets.slice(start, start + BATCH);
    const prompt = [
      `아래는 개인 영화 기록이다. 각 항목에 대해 기록 주인이 남긴 감상 코멘트를 근거로,`,
      `다음 15개 감정 어휘 중 이 기록에 가장 맞는 하나를 고른다: ${EMOTIONS.join(", ")}.`,
      `줄거리의 감정이 아니라 감상(코멘트)의 감정이다. 코멘트가 비었거나 감정을 고를`,
      `확신이 없으면 빈 문자열을 쓴다. 목록에 없는 말은 금지.`,
      `JSON 배열로만 답한다: [{"slug":"...","emotion":"...","why":"한 문장"}]`,
      "",
      ...batch.map((movie) =>
        JSON.stringify({
          slug: movie.slug,
          title: movie.title,
          year: movie.year,
          genre: movie.genre,
          themes: movie.themes,
          rating: movie.rating,
          comment: movie.comment.slice(0, 500),
        })
      ),
    ].join("\n");

    const text = await geminiText(key, prompt, true, GEMINI_LITE_MODEL);
    let parsed = [];
    try {
      parsed = JSON.parse(text.replace(/^```json?\s*|```\s*$/g, ""));
    } catch {
      console.error(`  배치 ${start / BATCH + 1}: JSON 파싱 실패 — 이 배치는 빈 값으로 남긴다`);
    }
    const bySlug = new Map(parsed.map((p) => [p.slug, p]));
    for (const movie of batch) {
      const p = bySlug.get(movie.slug);
      proposals.push({
        slug: movie.slug,
        title: movie.title,
        comment: movie.comment.slice(0, 60),
        emotion: parseEmotion(p?.emotion) || "",
        why: p?.why || "",
      });
    }
    console.log(`  배치 ${start / BATCH + 1}/${Math.ceil(targets.length / BATCH)} 완료`);
    if (start + BATCH < targets.length) await wait(4000);
  }

  fs.writeFileSync(PROPOSALS, JSON.stringify(proposals, null, 2));
  const filled = proposals.filter((p) => p.emotion).length;
  console.log(`\n초안 ${filled}/${proposals.length}편 → ${PROPOSALS}`);
  console.log("검토·수정 후 --apply로 반영한다. emotion을 비우면 그 영화는 건드리지 않는다.");
} else {
  const proposals = JSON.parse(fs.readFileSync(PROPOSALS, "utf8"));
  const bySlug = new Map(movies.map((movie) => [movie.slug, movie]));
  const unknown = proposals.filter((p) => !bySlug.has(p.slug));
  if (unknown.length) throw new Error(`DB에 없는 slug ${unknown.length}건 — 중단: ${unknown.map((p) => p.slug).join(", ")}`);

  fs.mkdirSync(BACKUP, { recursive: true });
  let done = 0;
  let skipped = 0;
  for (const p of proposals) {
    const emotion = parseEmotion(p.emotion);
    if (!emotion) { skipped++; continue; }
    const movie = bySlug.get(p.slug);
    if (movie.emotion === emotion) { skipped++; continue; }
    const out = setField(movie.raw.replace(/\r\n/g, "\n"), "emotion", emotion, "genre");
    if (out.match(FM)?.[2] !== movie.raw.replace(/\r\n/g, "\n").match(FM)?.[2]) throw new Error(`${p.slug}: 본문이 바뀌었다 — 중단`);
    if (fmValue(out.match(FM)[1], "emotion") !== emotion) throw new Error(`${p.slug}: emotion을 넣지 못했다 — 중단`);
    fs.writeFileSync(path.join(BACKUP, `${p.slug}.md`), movie.raw);
    await sql`update lyra_contents set raw = ${out}, updated_at = now() where kind='movie' and slug = ${p.slug}`;
    console.log(`${movie.title}: ${emotion}${p.why ? ` — ${p.why}` : ""}`);
    done++;
  }
  console.log(`\n반영 ${done}편 · 건너뜀 ${skipped}편`);
  if (done) {
    const secret = String(process.env.REVALIDATE_SECRET || "").trim();
    if (secret) {
      const res = await fetch("https://lyracyno.vercel.app/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": secret } });
      console.log(`캐시 무효화: HTTP ${res.status}`);
    }
  }
}
