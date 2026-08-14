// 가사 직접 붙여넣기 — 어디에서도 원문을 못 찾은 곡을 손으로 채운다.
//   node scripts/add-lyrics.mjs <slug> <가사파일.txt> [--source=<URL>] [--write]
//   node scripts/add-lyrics.mjs --list          가사 없는 곡 목록
//
// 붙여넣은 가사는 인스타 캡션에서 온 게 아니므로 `lyrics_external: true`로 표시하고
// 출처를 남긴다. 그래야 원본 대조(verify-instagram)가 이 본문을 캡션과 맞춰보지 않는다.
// 언어(lang)는 붙여넣은 글에서 자동으로 판단한다. 캡션에 있던 🗨 해설 줄은 그대로 둔다.
//
// 번역은 이 스크립트가 하지 않는다 — 채운 뒤 scripts/apply-translations.mjs로 붙인다.
import fs from "fs";
import { getAllSongs } from "../lib/songs.js";
import { guard } from "../lib/admin/preflight.js";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const SOURCE = (args.find((a) => a.startsWith("--source=")) || "").slice("--source=".length);
const [slug, file] = args.filter((a) => !a.startsWith("--"));

const lyricLess = () =>
  getAllSongs().filter(
    (s) => !s.instrumental && !s.stanzas.flatMap((st) => st.lines).some((l) => l.en?.trim() || l.ko?.trim())
  );

if (args.includes("--list") || !slug) {
  const rows = lyricLess();
  console.log(`가사 없는 곡 ${rows.length}개\n`);
  for (const s of rows) console.log(`  ${s.slug}\n    ${s.artist} — ${s.title} (${s.year || "연도 없음"})`);
  console.log(`\n사용법: node scripts/add-lyrics.mjs <slug> <가사파일.txt> [--source=<URL>] --write`);
  process.exit(0);
}
if (!file) { console.error("가사 파일 경로가 필요합니다"); process.exit(1); }
if (WRITE) guard();

const path = `songs/${slug}.md`;
if (!fs.existsSync(path)) { console.error(`없는 곡: ${slug}`); process.exit(1); }

// 붙여넣은 글 정리 — 줄 끝 공백과 세 줄 이상 빈 줄만 손본다. 그 외에는 그대로 둔다.
const lyrics = fs.readFileSync(file, "utf8")
  .replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n")
  .replace(/\n{3,}/g, "\n\n").trim();
if (!lyrics) { console.error("가사 파일이 비어 있습니다"); process.exit(1); }

const nonblank = lyrics.split("\n").filter((l) => l.trim());
const lang = nonblank.some((l) => /[ぁ-んァ-ン]/.test(l))
  ? "ja"
  : nonblank.filter((l) => /[가-힣]/.test(l)).length / nonblank.length > 0.4 ? "ko" : "en";

const raw = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!m) { console.error("프론트매터를 읽지 못했습니다"); process.exit(1); }
const body = m[2].trim();
if (body.split("\n").some((l) => l.trim() && !/^[🗨✏]/u.test(l.trim()))) {
  console.error("이미 본문이 있습니다 — 덮어쓰지 않습니다. /admin 가사 정확성 검토에서 고치세요.");
  process.exit(1);
}

// 프론트매터에 필드가 없으면 만들고, 있으면 값만 바꾼다
const setField = (fm, key, value) =>
  new RegExp(`^${key}:.*$`, "m").test(fm)
    ? fm.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${value}`)
    : fm.replace(/^source_hash:.*$/m, (l) => `${l}\n${key}: ${value}`);

let fm = setField(m[1], "lang", lang);
fm = setField(fm, "lyrics_external", "true");
fm = setField(fm, "lyrics_source", SOURCE || "직접 입력");

const out = `---\n${fm}\n---\n${[body, lyrics].filter(Boolean).join("\n")}\n`;
console.log(`${slug} — ${nonblank.length}줄 · lang: ${lang} · 출처: ${SOURCE || "직접 입력"}`);
if (!WRITE) { console.log("\n(미리보기 — 쓰려면 --write)"); process.exit(0); }
fs.writeFileSync(path, out);
console.log(`→ ${path} 저장`);
console.log(`다음: node scripts/apply-translations.mjs <번역.json>  (번역 붙이기)`);
