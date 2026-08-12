// 인스타그램 내보내기 → Lyra 곡 임포트 (원문 보존).
//   node scripts/instagram-import.mjs "<export 폴더>" [--dry]
//
// 원칙: 인스타 캡션 본문이 1차 원본이다.
//  - 줄·순서 그대로 보존, 원문·번역 쌍에만 Lyra 문법(`> `)을 앞에 붙인다
//  - Gemini 재번역·lrclib 교체·누락 보완 없음
//  - 변환 후 `> `만 제거해 원본과 대조(무손실 검증) — 다르면 저장하지 않고 검토로
//  - 기존 컬렉션과 겹치는 곡은 건드리지 않는다 (기존 곡 유지)
//  - 가사 없는 게시글은 data/instagram-pending.json에 대기 (나중에 일반 생성)
// 메타데이터(아트워크·미리듣기·trackId)는 iTunes에서 보강 — 가사와 무관한 장식.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getAllSongs } from "../lib/songs.js";
import { normText } from "../lib/admin/itunes.js";
import { kstDay } from "../lib/kst.js";

const [exportDir, ...flags] = process.argv.slice(2);
const DRY = flags.includes("--dry");
if (!exportDir) {
  console.error("사용법: node scripts/instagram-import.mjs <export 폴더> [--dry]");
  process.exit(1);
}

// Meta 내보내기는 UTF-8 바이트를 latin1로 이스케이프한다 — 복구
const fix = (s) => Buffer.from(s || "", "latin1").toString("utf8");

const postsPath = path.join(exportDir, "your_instagram_activity", "media", "posts_1.json");
const posts = JSON.parse(fs.readFileSync(postsPath, "utf8")).map((p) => ({
  caption: fix(p.title || p.media?.[0]?.title || ""),
  ts: p.creation_timestamp || p.media?.[0]?.creation_timestamp || 0,
}));

// ── 파싱 ────────────────────────────────────────────────────────────────────
// 헤더: `| 아티스트 - 제목 (한국어제목, 연도)` — 괄호는 (연도)만일 수도 있다
function parseHeader(caption) {
  const first = caption.split("\n")[0].replace(/#\S+/g, "").trim();
  const m = first.match(/^\|\s*(.+?)\s*[-–—]\s*(.+?)\s*(?:\(([^)]*)\))?\s*$/);
  if (!m) return null;
  let title_ko = "", year = "";
  if (m[3]) {
    const pm = m[3].match(/^(?:(.*?),\s*)?(\d{4})$/);
    if (pm) { title_ko = (pm[1] || "").trim(); year = pm[2]; }
    else title_ko = m[3].trim();
  }
  return { artist: m[1].trim(), title: m[2].trim(), title_ko, year };
}

// 본문: 헤더 다음 줄부터, 끝의 해시태그 블록 제거. `*설명` 줄은 source_note로.
function extractBody(caption) {
  let lines = caption.split("\n").slice(1);
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && (!lines.at(-1).trim() || /^#/.test(lines.at(-1).trim()))) lines.pop();
  const notes = lines.filter((l) => /^\s*[*※]/.test(l)).map((l) => l.replace(/^\s*[*※]\s*/, "").trim());
  lines = lines.filter((l) => !/^\s*[*※]/.test(l));
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return { lines, note: notes.join(" · ") };
}

const hasKo = (l) => /[가-힣]/.test(l);
const hasKana = (l) => /[ぁ-んァ-ン]/.test(l);
const hasForeign = (l) => /[a-zA-Zぁ-んァ-ン一-龯]/.test(l);

// 원문·번역 쌍 → `> `. 한국어 곡(한글 우세)은 손대지 않는다.
function convert(lines) {
  const nonblank = lines.filter((l) => l.trim());
  const koCount = nonblank.filter((l) => hasKo(l) && !hasKana(l)).length;
  const isKoSong = nonblank.length > 0 && koCount / nonblank.length > 0.65;
  if (isKoSong) return { out: [...lines], lang: "ko" };

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (
      cur?.trim() && next?.trim() &&
      hasForeign(cur) && !hasKo(cur) &&
      hasKo(next) && !hasKana(next)
    ) {
      out.push(cur, `> ${next}`);
      i++;
    } else {
      out.push(cur);
    }
  }
  const lang = nonblank.some((l) => hasKana(l)) ? "ja" : "en";
  return { out, lang };
}

// ── iTunes 보강 (아트워크·미리듣기·trackId — 본문과 무관한 장식) ────────────
async function enrich(title, artist, lang) {
  const stores = lang === "ja" ? ["JP", "US"] : ["US", "KR"];
  const term = encodeURIComponent(`${title} ${artist}`);
  for (const c of stores) {
    try {
      const r = await fetch(
        `https://itunes.apple.com/search?term=${term}&entity=song&limit=5&country=${c}`
      ).then((x) => x.json());
      const hit = (r.results || []).find(
        (x) =>
          normText(x.artistName).includes(normText(artist)) ||
          normText(artist).includes(normText(x.artistName))
      );
      if (hit)
        return {
          artwork: (hit.artworkUrl100 || "").replace("100x100", "600x600"),
          preview: hit.previewUrl || "",
          trackId: hit.trackId || "",
          duration: Math.round((hit.trackTimeMillis || 0) / 1000) || "",
          album: hit.collectionName || "",
          genre: hit.primaryGenreName || "",
          year: (hit.releaseDate || "").slice(0, 4),
        };
    } catch {}
  }
  return null;
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const existing = getAllSongs();
const haveKey = new Set(
  existing.flatMap((s) => [
    normText(`${s.title}|${s.artist}`),
    normText(`${(s.title_ko || "")}|${s.artist}`),
  ])
);
const usedSlugs = new Set(existing.map((s) => s.slug));
const slugOf = (artist, title) => {
  let slug = `${artist} ${title}`
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
    .replace(/^-|-$/g, "") || "insta";
  while (usedSlugs.has(slug)) slug += "-2";
  usedSlugs.add(slug);
  return slug;
};

const stats = { saved: 0, dupSkipped: 0, pending: 0, review: [] };
const pending = [];

for (const post of posts) {
  const h = parseHeader(post.caption);
  if (!h) { stats.review.push({ reason: "헤더 파싱 실패", head: post.caption.split("\n")[0] }); continue; }

  const dateTag = (post.caption.match(/#(\d{6}_\d{4})/) || [])[1] || "";
  const isDup = haveKey.has(normText(`${h.title}|${h.artist}`)) || (h.title_ko && haveKey.has(normText(`${h.title_ko}|${h.artist}`)));
  if (isDup) { stats.dupSkipped++; continue; }

  const { lines, note } = extractBody(post.caption);
  if (lines.filter((l) => l.trim()).length < 4) {
    stats.pending++;
    pending.push({ artist: h.artist, title: h.title, title_ko: h.title_ko, year: h.year, ts: post.ts, tag: dateTag });
    continue;
  }

  const { out, lang } = convert(lines);
  // 무손실 검증 — 붙인 `> `만 벗겨 원본과 대조
  const stripped = out.map((l) => l.replace(/^> /, ""));
  if (stripped.join("\n") !== lines.join("\n")) {
    stats.review.push({ reason: "무손실 검증 실패", head: `${h.artist} - ${h.title}` });
    continue;
  }

  const meta = DRY ? null : await enrich(h.title, h.artist, lang);
  const published = new Date(post.ts * 1000).toISOString();
  const md = `---
title: ${h.title}
title_ko: ${h.title_ko || (lang === "ko" ? h.title : "")}
artist: ${h.artist}
artist_ko:
album: ${meta?.album || ""}
year: ${h.year || meta?.year || ""}
artwork: ${meta?.artwork || ""}
preview: ${meta?.preview || ""}
trackId: ${meta?.trackId || ""}
duration: ${meta?.duration || ""}
genre: ${meta?.genre || ""}
lang: ${lang}
tags: [${h.year || meta?.year || ""}]
keywords: []
emotion:
date: ${kstDay(published)}
published: ${published}
comment:
source: instagram
source_tag: ${dateTag}
source_note: ${note}
source_hash: ${crypto.createHash("sha1").update(post.caption).digest("hex")}
---
${out.join("\n")}
`;
  const slug = slugOf(h.artist, h.title);
  if (!DRY) fs.writeFileSync(path.join("songs", `${slug}.md`), md);
  stats.saved++;
}

if (!DRY)
  fs.writeFileSync(
    path.join("data", "instagram-pending.json"),
    JSON.stringify({ items: pending, at: new Date().toISOString() }, null, 1)
  );

console.log(`저장 ${stats.saved} · 기존 곡 중복 스킵 ${stats.dupSkipped} · 가사 없음(대기) ${stats.pending} · 검토 ${stats.review.length}${DRY ? " (dry)" : ""}`);
stats.review.forEach((r) => console.log(`  검토: [${r.reason}] ${r.head}`));
