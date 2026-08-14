// 4단계 — 모델이 채워 온 결과를 코드가 검증한다 (모델보다 코드가 안정적이다).
//   node scripts/validate-bulk.mjs <generated.json ...> [--write]
//
// 통과한 항목만 곡 파일에 병합하고, 거부 사유는 data/validation-report.json에 남긴다.
// 규칙:
//  - id(slug)·title·artist는 절대 바꾸지 않는다. 모델이 보내와도 무시하고 기록만 한다.
//  - 감정·장르·국가는 닫힌 어휘, 연도는 4자리, 커버는 https, 코멘트는 ~다체.
//  - 키워드는 3~8개, 중복 제거.
//  - 기존 값이 있으면 덮지 않는다 (--overwrite 를 줄 때만 덮는다).
import fs from "fs";
import { getAllSongs } from "../lib/songs.js";
import { guard } from "../lib/admin/preflight.js";
import { FM, fmValue, setField } from "../lib/admin/frontmatter.js";
import { EMOTIONS, parseEmotion, parseKeywords } from "../lib/keywords.js";
import { GENRES, capGenre, COUNTRY_TAGS } from "../lib/genre.js";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const OVERWRITE = args.includes("--overwrite");
const files = args.filter((a) => !a.startsWith("--"));
if (WRITE) guard();

const bySlug = new Map(getAllSongs().map((s) => [s.slug, s]));
const report = { at: new Date().toISOString(), applied: [], rejected: [], ignored: [] };

// 어떤 모델이 무엇을 만들었는지 남긴다 — 나중에 "이 문장 누가 썼나"를 물을 수 있어야 한다.
// 파일 안에 model/generated_at/prompt_version이 있으면 그대로 쓰고, 없으면 인자로 받는다.
const LEDGER = "data/ai-generation-log.json";
const argOf = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || "";

for (const file of files) {
  let items = [], meta = {};
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    items = Array.isArray(j) ? j : j.items || [];
    meta = Array.isArray(j) ? {} : { model: j.model, generated_at: j.generated_at, prompt_version: j.prompt_version };
  } catch (e) {
    report.rejected.push({ file, why: `JSON 파싱 실패: ${e.message.slice(0, 60)}` });
    continue;
  }

  for (const it of items) {
    const slug = it.slug || it.id;
    const song = bySlug.get(slug);
    if (!song) { report.rejected.push({ slug, why: "없는 곡" }); continue; }
    // 모델이 바꾸면 안 되는 것들 — 보내왔으면 무시했다고 남긴다
    for (const k of ["title", "artist", "id", "slug"])
      if (it[k] !== undefined && k !== "slug" && String(it[k]) !== String(song[k] ?? ""))
        report.ignored.push({ slug, field: k, sent: it[k], kept: song[k] });

    const p = `songs/${slug}.md`;
    let raw = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    const fm = raw.match(FM)?.[1];
    if (!fm) { report.rejected.push({ slug, why: "frontmatter 없음" }); continue; }
    const changed = [];
    const has = (k) => {
      const v = fmValue(raw.match(FM)[1], k);
      return v && v !== "[]";
    };

    if (it.emotion !== undefined && String(it.emotion).trim()) {
      const e = parseEmotion(it.emotion);
      if (!e) report.rejected.push({ slug, field: "emotion", why: `목록 밖: ${it.emotion} (${EMOTIONS.length}개 중 하나여야 함)` });
      else if (!has("emotion") || OVERWRITE) { raw = setField(raw, "emotion", e, "keywords"); changed.push("emotion"); }
    }
    if (it.keywords !== undefined) {
      const kw = [...new Set(parseKeywords(Array.isArray(it.keywords) ? it.keywords.join(", ") : it.keywords))];
      if (kw.length < 3 || kw.length > 8) report.rejected.push({ slug, field: "keywords", why: `개수 ${kw.length} (3~8이어야 함)` });
      else if (!has("keywords") || OVERWRITE) { raw = setField(raw, "keywords", `[${kw.join(", ")}]`, "tags"); changed.push("keywords"); }
    }
    if (it.comment !== undefined && String(it.comment).trim()) {
      const c = String(it.comment).trim().replace(/\s+/g, " ");
      if (/(습니다|합니다|해요|하죠)\.?$/.test(c)) report.rejected.push({ slug, field: "comment", why: "문체(~다체 아님)" });
      else if (!has("comment") || OVERWRITE) { raw = setField(raw, "comment", c, "date"); changed.push("comment"); }
    }
    if (it.title_ko !== undefined && String(it.title_ko).trim() && (!has("title_ko") || OVERWRITE)) {
      raw = setField(raw, "title_ko", String(it.title_ko).trim(), "title");
      changed.push("title_ko");
    }
    if (it.genre !== undefined && String(it.genre).trim()) {
      const g = capGenre(it.genre);
      if (!GENRES.includes(g)) report.rejected.push({ slug, field: "genre", why: `목록 밖: ${it.genre}` });
      else if (!has("genre") || OVERWRITE) { raw = setField(raw, "genre", g, "duration"); changed.push("genre"); }
    }
    if (it.year !== undefined && String(it.year).trim()) {
      if (!/^\d{4}$/.test(String(it.year))) report.rejected.push({ slug, field: "year", why: `4자리가 아님: ${it.year}` });
      else if (!has("year") || OVERWRITE) { raw = setField(raw, "year", String(it.year), "album"); changed.push("year"); }
    }
    if (it.artwork !== undefined && String(it.artwork).trim()) {
      if (!/^https:\/\//.test(it.artwork)) report.rejected.push({ slug, field: "artwork", why: "https 아님" });
      else if (!has("artwork") || OVERWRITE) { raw = setField(raw, "artwork", String(it.artwork), "year"); changed.push("artwork"); }
    }
    // 태그의 국가·장르·연도 세 자리를 맞춘다
    if (changed.includes("genre") || changed.includes("year")) {
      const fm2 = raw.match(FM)[1];
      const tags = (fmValue(fm2, "tags") || "").replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean);
      const country = tags.find((t) => COUNTRY_TAGS.includes(t)) || "";
      raw = setField(raw, "tags", `[${[country, fmValue(fm2, "genre"), fmValue(fm2, "year")].filter(Boolean).join(", ")}]`, "lang");
    }

    if (!changed.length) continue;
    if (WRITE) fs.writeFileSync(p, raw);
    report.applied.push({
      slug, changed,
      confidence: it.confidence || "",
      model: it.model || meta.model || argOf("model") || "unknown",
      generated_at: it.generated_at || meta.generated_at || "",
      prompt_version: it.prompt_version || meta.prompt_version || argOf("prompt-version") || "",
      reviewed: it.reviewed === true,
    });
  }
}

fs.writeFileSync("data/validation-report.json", JSON.stringify(report, null, 1));

// 원장에 이어 붙인다 (덮어쓰지 않는다 — 이력이니까)
if (WRITE && report.applied.length) {
  let log = { entries: [] };
  try { log = JSON.parse(fs.readFileSync(LEDGER, "utf8")); } catch {}
  log.entries = log.entries || [];
  log.entries.push({
    at: report.at,
    files: files.map((f) => f.split(/[\\/]/).pop()),
    applied: report.applied.length,
    rejected: report.rejected.length,
    byModel: report.applied.reduce((acc, a) => ((acc[a.model] = (acc[a.model] || 0) + 1), acc), {}),
    fields: [...new Set(report.applied.flatMap((a) => a.changed))],
    slugs: report.applied.map((a) => a.slug),
  });
  log.at = report.at;
  fs.writeFileSync(LEDGER, JSON.stringify(log, null, 1));
}
console.log(`${WRITE ? "반영" : "검증만"} — 통과 ${report.applied.length} · 거부 ${report.rejected.length} · 무시(불변 필드) ${report.ignored.length}`);
for (const r of report.rejected.slice(0, 10)) console.log(`  ✗ ${r.slug || r.file}${r.field ? `.${r.field}` : ""}: ${r.why}`);
if (report.rejected.length > 10) console.log(`  … 외 ${report.rejected.length - 10}건 (data/validation-report.json)`);
