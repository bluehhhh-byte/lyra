// 보류 게시글 → 곡 파일. 캡션에 가사를 안 적고 한 줄 요약만 올린 글들이다.
//   node scripts/import-pending.mjs <가사포함.json> [--write]
//
// 임포터(instagram-import.mjs)는 가사가 4줄도 없는 게시글을 data/instagram-pending.json에
// 미뤄 둔다. 그 글도 기록이므로 곡으로 만들되, 가사는 캡션이 아니라 밖에서 가져온다.
// 그래서 원본 대조(verify-instagram)에서 이 곡들은 본문 비교 대상이 아니다 —
// `lyrics_source`가 그 표시다. 캡션에서 온 것은 요약(→ comment)과 메모(→ source_note)뿐이다.
//
// 입력 JSON은 [{ artist, title, title_ko, year, summary, note, ts, tag, sourceHash,
//                found, lyrics, matchedArtist, matchedTitle, duration }] 형태.
import fs from "fs";
import { getAllSongs } from "../lib/songs.js";
import { kstDay } from "../lib/kst.js";
import { guard } from "../lib/admin/preflight.js";

const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const WRITE = process.argv.includes("--write");
if (!file) {
  console.error("사용법: node scripts/import-pending.mjs <가사포함.json> [--write]");
  process.exit(1);
}
if (WRITE) guard();

const rows = JSON.parse(fs.readFileSync(file, "utf8"));
const existing = getAllSongs();
const used = new Set(existing.map((s) => s.slug));
const slugOf = (artist, title) => {
  let slug = `${artist} ${title}`
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
    .replace(/^-|-$/g, "") || "insta";
  while (used.has(slug)) slug += "-2";
  used.add(slug);
  return slug;
};

const hasKo = (l) => /[가-힣]/.test(l);
const hasKana = (l) => /[ぁ-んァ-ン]/.test(l);
// 가사 원문의 언어. 한자만 있는 줄은 중국어·일본어 어느 쪽도 될 수 있어 가나로만 판단한다.
function detectLang(lyrics) {
  const lines = lyrics.split("\n").filter((l) => l.trim());
  if (!lines.length) return "";
  if (lines.some(hasKana)) return "ja";
  return lines.filter(hasKo).length / lines.length > 0.5 ? "ko" : "en";
}

// 가사 본문 정리 — lrclib은 빈 줄로 문단을 나눈다. 앞뒤 공백만 턴다.
const cleanLyrics = (s) =>
  s.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();

// 가사 출처는 URL로 남긴다 — 나중에 같은 조회를 다시 해서 대조할 수 있어야 한다
const lrclibUrl = (r) =>
  `https://lrclib.net/api/get?artist_name=${encodeURIComponent(r.matchedArtist || r.artist)}` +
  `&track_name=${encodeURIComponent(r.matchedTitle || r.title)}`;

const yamlSafe = (s) => {
  const v = String(s ?? "").trim();
  if (!v) return ""; // 빈 값은 빈 칸으로 — `""`가 남으면 admin이 값이 있다고 읽는다
  return /^[\s>|&*#{}[\]!%@`'"]|:\s|\s#/.test(v) ? JSON.stringify(v) : v;
};

// 이미 가진 곡의 slug와 그대로 겹치면 같은 곡이다 — 분류가 놓친 중복(따옴표 표기 차이 등).
// `-2`를 붙여 새 파일을 만들면 같은 곡이 두 개가 되므로 여기서 뺀다.
const bare = (a, t) => `${a} ${t}`.toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-").replace(/^-|-$/g, "");
const already = rows.filter((r) => used.has(bare(r.artist, r.title)));
if (already.length) {
  console.log(`이미 있는 곡 ${already.length}건 제외`);
  for (const r of already) console.log(`  ${r.artist} — ${r.title}`);
}

const out = [];
for (const r of rows) {
  if (already.includes(r)) continue;
  const slug = slugOf(r.artist, r.title);
  const lyrics = r.found ? cleanLyrics(r.lyrics) : "";
  const lang = detectLang(lyrics) || (hasKo(r.title + r.artist) && !hasKana(r.title + r.artist) ? "ko" : "en");
  const published = new Date((r.ts || 0) * 1000).toISOString();
  const md = `---
title: ${yamlSafe(r.title)}
title_ko: ${yamlSafe(r.title_ko || (lang === "ko" ? r.title : ""))}
artist: ${yamlSafe(r.artist)}
artist_ko:
album:
year: ${r.year || ""}
artwork:
preview:
trackId:
duration: ${r.duration ? Math.round(r.duration) : ""}
genre:
lang: ${lang}
tags: [${r.year || ""}]
keywords: []
emotion:
date: ${kstDay(published)}
published: ${published}
comment: ${yamlSafe(r.summary || "")}
source: instagram
source_tag: ${r.tag || ""}
source_note: ${yamlSafe(r.note || "")}
source_hash: ${r.sourceHash}
lyrics_external: ${r.found ? "true" : ""}
lyrics_source: ${r.found ? lrclibUrl(r) : ""}
---
${[...(r.bodyLines || []), ...(lyrics ? [lyrics] : [])].join("\n").trim()}
`;
  out.push({ slug, lang, found: r.found, md });
}

const found = out.filter((o) => o.found).length;
console.log(`보류 ${rows.length}건 → 곡 ${out.length}개 (가사 있음 ${found} · 없음 ${out.length - found})`);
console.log(`  언어: ko ${out.filter((o) => o.lang === "ko").length} · en ${out.filter((o) => o.lang === "en").length} · ja ${out.filter((o) => o.lang === "ja").length}`);
if (!WRITE) {
  console.log("\n(미리보기 — 쓰려면 --write)");
  for (const o of out.slice(0, 3)) console.log(`  songs/${o.slug}.md`);
  process.exit(0);
}
for (const o of out) fs.writeFileSync(`songs/${o.slug}.md`, o.md);
console.log(`→ songs/*.md ${out.length}개 저장`);
