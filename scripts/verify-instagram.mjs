// 인스타 원본 무결성 검증 — 내보내기 원본과 곡 파일을 직접 대조한다.
//   node scripts/verify-instagram.mjs "<export 폴더>"
//   pnpm verify:instagram -- "<export 폴더>"
//
// 임포트 이후 곡 파일에는 번역(`> `, `>^N `)이 계속 추가된다. 그래서 "본문이 같다"로는
// 검사할 수 없고, 원본의 모든 줄이 순서대로 그대로 남아 있는지를 본다:
//   - 원본 줄이 사라졌거나(삭제) 글자가 바뀌었거나(수정) 순서가 바뀌면(재배열) 오류
//   - 추가된 줄은 `>`로 시작하는 파생 번역일 때만 허용
//   - source_hash가 두 곡에 붙어 있으면 오류 (같은 게시글에서 곡이 두 개 나온 것)
// 대조표(data/instagram-source-manifest.json)는 참고용 — 원본이 있으면 원본이 우선이다.
import fs from "fs";
import path from "path";
import { getAllSongs } from "../lib/songs.js";
import { adaptPosts, dedupePosts, extractBody, sourceHash, bodyHash } from "../lib/admin/instagram.js";
import { parseFrontmatter } from "../lib/songs.js";
import { load as loadCorrections, lineHash } from "../lib/admin/corrections.js";

const exportDir = process.argv[2];
if (!exportDir) {
  console.error('사용법: node scripts/verify-instagram.mjs "<export 폴더>"');
  process.exit(1);
}

const mediaDir = path.join(exportDir, "your_instagram_activity", "media");
const raw = [];
for (const f of ["posts_1.json", "archived_posts.json", "reels.json"]) {
  const p = path.join(mediaDir, f);
  if (fs.existsSync(p)) raw.push(...adaptPosts(JSON.parse(fs.readFileSync(p, "utf8")), f.replace(".json", "")));
}
const byHash = new Map(dedupePosts(raw).map((p) => [sourceHash(p.caption), p]));

let manifest = new Map();
try {
  manifest = new Map(
    JSON.parse(fs.readFileSync("data/instagram-source-manifest.json", "utf8")).items.map((i) => [i.slug, i])
  );
} catch {} // 대조표가 없어도 원본만으로 검증한다

// 인스타 원본과 달라진 줄은 data/lyrics-corrections.json에 근거가 있어야 한다.
// (인스타에 처음부터 있던 오타를 고친 경우 — source_hash는 원본을 계속 가리킨다)
const corrections = loadCorrections((p) => fs.readFileSync(p, "utf8")).items;
const EMPTY_HASH = lineHash("");
// 교체된 줄(afterHash)과 지운 줄(beforeHash, after가 빈 문자열)을 따로 본다
const approvedFor = (slug) => ({
  replaced: new Set(corrections.filter((c) => c.slug === slug && c.afterHash !== EMPTY_HASH).map((c) => c.afterHash)),
  deleted: new Set(corrections.filter((c) => c.slug === slug && c.afterHash === EMPTY_HASH).map((c) => c.beforeHash)),
});
let approvedUsed = 0;

// 눈에 보이지 않는 문자(제로폭 공백·BOM·NBSP)와 줄 끝 공백은 내용이 아니다.
// 캡션에는 이런 문자가 흔하고, 파일을 다시 쓰는 과정에서 사라지기도 한다.
const norm = (s) => (s || "").replace(/[​-‍﻿]/g, "").replace(/ /g, " ").trimEnd();

const errors = [], warns = [];
const songs = getAllSongs().filter((s) => s.source === "instagram");
const seenHash = new Map();
let checked = 0, noSource = 0;

for (const s of songs) {
  const f = `songs/${s.slug}.md`;
  if (!s.source_hash) { noSource++; continue; }
  if (seenHash.has(s.source_hash)) errors.push(`${f}: source_hash 중복 (${seenHash.get(s.source_hash)}와 같은 게시글)`);
  else seenHash.set(s.source_hash, f);

  const post = byHash.get(s.source_hash);
  if (!post) { warns.push(`${f}: 이번 내보내기에 원본 게시글이 없음 (삭제됐거나 다른 계정)`); continue; }
  checked++;

  // 캡션 길이 제한에 걸려 가사 뒷부분을 본인 댓글로 이어 쓴 게시글이 있다.
  // 그 곡은 캡션 원문 + 댓글 꼬리로 만들어졌으므로 "(댓글에 이어서)" 표시줄이
  // 사라지고 뒤에 줄이 붙는 게 정상이다 — 캡션 쪽 줄만 그대로면 통과로 본다.
  const commentMerged = /댓글\s*병합/.test(s.source_note || "");
  const originalAll = extractBody(post.caption).lines; // 대조표는 캡션 원본 그대로를 기록한다
  const original = originalAll.filter((l) => !(commentMerged && /댓글/.test(l)));
  const body = parseFrontmatter(fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n")).body.replace(/\n$/, "").split("\n");

  // 원본 줄을 순서대로 따라간다. 파일 쪽 줄은 원본 줄과 같거나, 임포터가 앞에
  // 붙인 `> `/`>^N `를 벗기면 같아야 한다. 그 외 줄은 나중에 붙인 번역만 허용.
  const approved = approvedFor(s.slug);
  let oi = 0, tail = 0, fixed = 0;
  for (let bi = 0; bi < body.length; bi++) {
    const line = body[bi];
    const derived = /^>/.test(line);
    const bare = norm(line.replace(/^>(\^\d+)?\s?/, ""));
    // 근거가 기록된 '삭제'는 원본 줄을 건너뛴다 (가사가 아닌 줄을 뺀 경우)
    while (oi < original.length && approved.deleted.has(lineHash(original[oi].trim()))) { oi++; fixed++; }
    const want = oi < original.length ? norm(original[oi]) : null;
    // 근거가 기록된 교정이면 원본과 달라도 통과 — 그 줄이 원본 한 줄을 대신한다
    if (!derived && approved.replaced.has(lineHash(line.trim())) && want !== null) { oi++; fixed++; continue; }
    // 번역이 원문과 같은 문자열일 때(영어 곡의 영어 후렴 등) 파생 줄이 원문 자리를
    // 먼저 차지해 뒤가 어긋난다 — 바로 다음 줄이 원문 그 자체면 그쪽에 양보한다
    const nextIsSame = derived && bi + 1 < body.length && !/^>/.test(body[bi + 1]) && norm(body[bi + 1]) === want;
    if (want !== null && bare === want && !nextIsSame) { oi++; continue; }
    if (derived) continue; // 우리가 덧붙인 번역
    if (commentMerged) { tail++; continue; } // 댓글에서 이어 붙인 꼬리
    errors.push(`${f}: 원본에 없는 줄 — "${line.slice(0, 40)}"`);
  }
  // 파일 끝까지 돌고 남은 원본 줄도 '승인된 삭제'면 건너뛴다 (마지막 줄을 지운 경우)
  while (oi < original.length && approved.deleted.has(lineHash(original[oi].trim()))) { oi++; fixed++; }
  if (tail) warns.push(`${f}: 캡션 뒤 ${tail}줄은 이어쓴 댓글에서 온 것 (source_note에 기록됨)`);
  if (fixed) { approvedUsed += fixed; warns.push(`${f}: 승인된 교정 ${fixed}줄 (인스타 원본과 다름 — data/lyrics-corrections.json에 근거)`); }
  if (oi < original.length)
    errors.push(`${f}: 원본 ${original.length}줄 중 ${original.length - oi}줄이 사라졌거나 순서가 바뀜 (첫 미일치: "${(original[oi] || "").slice(0, 40)}")`);

  // 대조표가 있으면 줄 수·본문 해시도 같이 본다
  const man = manifest.get(s.slug);
  if (man) {
    if (man.originalLineCount !== originalAll.length)
      warns.push(`${f}: 대조표 줄 수 ${man.originalLineCount} ≠ 원본 ${originalAll.length}`);
    if (man.sourceBodyHash && man.sourceBodyHash !== bodyHash(originalAll))
      errors.push(`${f}: 대조표 본문 해시 불일치 — 원본 캡션이 바뀌었거나 대조표가 낡음`);
  }
}

for (const w of warns) console.log(`  ⚠ ${w}`);
for (const e of errors) console.log(`  ✗ ${e}`);
console.log(
  `\n인스타 출처 곡 ${songs.length} · 원본 대조 ${checked} · source_hash 없음 ${noSource}` +
  ` · 승인 교정 ${approvedUsed}줄 — 오류 ${errors.length} · 경고 ${warns.length}`
);
process.exit(errors.length ? 1 : 0);
