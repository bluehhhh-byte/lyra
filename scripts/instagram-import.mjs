// 인스타그램 내보내기 → Lyra 곡 임포트 (원문 보존).
//   node scripts/instagram-import.mjs "<export 폴더>" [--write]
//
// 기본은 dry-run — --write 없이는 파일을 만들지 않는다.
// 읽는 파일: posts_1.json(피드) · archived_posts.json(보관) · reels.json(릴스).
// 같은 캡션이 여러 파일에 있으면 곡은 하나만 만들고 게시 이력은 전부 남긴다.
//
// 원칙: 인스타 캡션 본문이 1차 원본이다.
//  - 줄·순서 그대로 보존, 원문·번역 쌍에만 Lyra 문법(`> `)을 앞에 붙인다
//  - Gemini 재번역·lrclib 교체·누락 보완 없음
//  - 변환 후 `> `만 제거해 원본과 대조(무손실 검증) — 다르면 저장하지 않고 검토로
//  - 기존 컬렉션과 겹치는 곡은 건드리지 않는다 (title+artist 또는 source_hash 일치)
//  - 가사 없는 게시글은 data/instagram-pending.json에 대기 (나중에 일반 생성)
//
// 커버·미리듣기·앨범 같은 메타는 여기서 채우지 않는다. 임포트는 원문만 옮기고,
// 외부 카탈로그 조회는 scripts/meta-backfill.mjs가 엄격 매칭(lib/admin/match.js)과
// rate-limit circuit breaker를 갖고 따로 돈다. 예전 임포터는 아티스트만 맞으면
// 곡을 채택해 커버·미리듣기가 통째로 다른 곡이 되는 사고를 냈다.
import fs from "fs";
import path from "path";
import { getAllSongs } from "../lib/songs.js";
import { adaptPosts, dedupePosts, planImport, sourceHash, bodyHash, extractBody } from "../lib/admin/instagram.js";

const [exportDir, ...flags] = process.argv.slice(2);
const WRITE = flags.includes("--write");
if (!exportDir) {
  console.error("사용법: node scripts/instagram-import.mjs <export 폴더> [--write]");
  process.exit(1);
}

export const SOURCE_FILES = ["posts_1.json", "archived_posts.json", "reels.json"];
const mediaDir = path.join(exportDir, "your_instagram_activity", "media");

const raw = [];
for (const f of SOURCE_FILES) {
  const p = path.join(mediaDir, f);
  if (!fs.existsSync(p)) { console.log(`  (없음) ${f}`); continue; }
  const got = adaptPosts(JSON.parse(fs.readFileSync(p, "utf8")), f.replace(".json", ""));
  console.log(`  ${f}: ${got.length}건`);
  raw.push(...got);
}
const posts = dedupePosts(raw);
console.log(`읽음 ${raw.length}건 · 같은 캡션 묶어 ${posts.length}건 (재게시 ${raw.length - posts.length})`);

const existing = getAllSongs();
const { files, pending, review, dupSkipped } = planImport(posts, existing);

// 원본 대조표 — 내보내기 원본이 없어도 나중에 무결성 검증을 할 수 있게 남긴다.
// 기존에 들어온 곡도 source_hash로 이번 내보내기와 맞춰 함께 기록한다.
const byHash = new Map(posts.map((p) => [sourceHash(p.caption), p]));
const manifest = [];
for (const s of existing) {
  const p = s.source_hash && byHash.get(s.source_hash);
  if (!p) continue;
  const { lines } = extractBody(p.caption);
  manifest.push({
    slug: s.slug,
    sourceHash: s.source_hash,
    sourceBodyHash: bodyHash(lines),
    originalLineCount: lines.length,
    sourceFile: p.sourceFile,
    postedAt: p.ts ? new Date(p.ts * 1000).toISOString() : "",
    reposts: (p.reposts || []).map((r) => ({ at: new Date(r.ts * 1000).toISOString(), sourceFile: r.sourceFile })),
  });
}
for (const f of files) {
  const p = byHash.get(f.sourceHash);
  manifest.push({
    slug: f.slug,
    sourceHash: f.sourceHash,
    sourceBodyHash: f.sourceBodyHash,
    originalLineCount: f.originalLineCount,
    sourceFile: p?.sourceFile || "",
    postedAt: p?.ts ? new Date(p.ts * 1000).toISOString() : "",
    reposts: (p?.reposts || []).map((r) => ({ at: new Date(r.ts * 1000).toISOString(), sourceFile: r.sourceFile })),
  });
}
manifest.sort((a, b) => a.slug.localeCompare(b.slug));

if (WRITE) {
  for (const f of files) fs.writeFileSync(path.join("songs", `${f.slug}.md`), f.md);
  fs.writeFileSync(
    path.join("data", "instagram-pending.json"),
    JSON.stringify({ items: pending, at: new Date().toISOString() }, null, 1)
  );
  fs.writeFileSync(
    path.join("data", "instagram-source-manifest.json"),
    JSON.stringify({ items: manifest, at: new Date().toISOString() }, null, 1)
  );
}

console.log(
  `저장 ${files.length} · 기존 곡 중복 스킵 ${dupSkipped} · 가사 없음(대기) ${pending.length}` +
  ` · 검토 ${review.length} · 대조표 ${manifest.length}곡${WRITE ? "" : " (dry-run — 적용하려면 --write)"}`
);
const reasons = {};
for (const r of review) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
for (const [reason, n] of Object.entries(reasons)) console.log(`  검토: ${reason} ${n}건`);
if (WRITE && files.length) console.log("메타(커버·미리듣기)는 node scripts/meta-backfill.mjs --write 로 따로 채운다");
