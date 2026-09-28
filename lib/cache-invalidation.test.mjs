// 저장 한 건이 비우는 캐시 범위 — Neon 월 전송량(무료 5GB)을 지키는 규칙.
//   node lib/cache-invalidation.test.mjs
//
// 2026-09-28에 전송 한도가 다시 소진됐다. 곡 하나를 저장해도 lyra-content/lyra-songs
// 태그가 샤드 전부·메타 전량·곡별 상세 전부를 비웠고, 관리자 일괄 작업은 "전곡 읽기 →
// 한 곡 저장"을 곡마다 되풀이해 곡마다 수 MB를 Neon에서 다시 읽었다.
import assert from "node:assert/strict";
import fs from "node:fs";
import { CONTENT_SHARDS, shardTag, metaShardTag, dataTag, REVISION_TAG, rowTag } from "./content-db.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const db = read("./content-db.js");
const store = read("./store.js");

// 태그는 샤드·데이터마다 다르고, 목록 태그와 겹치지 않는다
assert.equal(CONTENT_SHARDS, 8);
const tags = [
  ...Array.from({ length: CONTENT_SHARDS }, (_, i) => shardTag("song", i)),
  ...Array.from({ length: CONTENT_SHARDS }, (_, i) => metaShardTag("song", i)),
  shardTag("movie", 0), dataTag("watcha-movies.json"), dataTag("song-recs.json"), REVISION_TAG, rowTag("song", "a"),
];
assert.equal(new Set(tags).size, tags.length, "태그가 서로 겹치면 엉뚱한 캐시가 비워진다");
for (const t of tags) assert.ok(!["lyra-content", "lyra-songs", "lyra-movies", "lyra-data"].includes(t));
assert.ok(dataTag("곡 데이터.json").length < 64, "한글 이름도 헤더에 들어가는 짧은 태그가 된다");

// 샤드 기준은 DB 한 곳 — 목록·메타·저장 반환값이 같은 식을 쓴다
const shardExpr = /mod\(abs\(hashtext\(slug\)\), \$\{CONTENT_SHARDS\}\)/g;
assert.ok((db.match(shardExpr) || []).length >= 3, "본문 샤드·메타 샤드·저장 반환이 같은 샤드 식을 쓴다");
assert.match(db, /returning revision, mod\(abs\(hashtext\(slug\)\), \$\{CONTENT_SHARDS\}\) as shard/);
assert.match(db, /tags: \[\.\.\.contentTags\(kind\), shardTag\(kind, shard\)\]/, "본문 샤드는 자기 태그를 단다");
assert.match(db, /tags: \[\.\.\.contentTags\(kind\), metaShardTag\(kind, shard\)\]/, "메타 샤드도 자기 태그를 단다");
assert.match(db, /tags: \["lyra-data", dataTag\(name\)\]/, "데이터 행은 이름별 태그를 단다");
assert.match(db, /const CACHE_TTL_SECONDS = 24 \* 60 \* 60;/, "정확히 무효화하므로 시한은 하루면 된다");

// 저장 경로는 목록 태그를 비우지 않는다(삭제만 예외)
const saved = store.slice(store.indexOf("function revalidateSaved"), store.indexOf("async function invalidate"));
assert.ok(!/lyra-content/.test(saved), "저장이 lyra-content를 비우면 영화·데이터 revision까지 다시 읽는다");
assert.match(saved, /revalidateTag\(shardTag\(kind, shard\)\)/);
assert.match(saved, /revalidateTag\(metaShardTag\(kind, shard\)\)/);
const inv = store.slice(store.indexOf("async function invalidate"), store.indexOf("const safeSlug"));
const invSaveBranch = inv.slice(inv.indexOf("} else {"));
assert.ok(!/lyra-content|lyra-songs/.test(invSaveBranch.slice(0, invSaveBranch.indexOf("revalidatePath"))), "저장 분기는 목록 태그를 비우지 않는다");
assert.match(store, /const saved = await writeContentRow\(kind, safeSlug\(slug\), raw\);\n\s+await invalidate\(kind, safeSlug\(slug\), \{ shard: saved\?\.shard \}\);/);
const commit = store.slice(store.indexOf("export async function commitFiles"), store.indexOf("return \"database\""));
assert.ok(!/revalidateTag\("lyra-data"\)/.test(commit), "일괄 저장이 데이터 전체를 비우지 않는다");
assert.match(commit, /revalidateSaved\(revalidateTag, s\.kind, s\.slug, s\.shard\)/);
const writeData = store.slice(store.indexOf("export async function writeData"), store.indexOf("export async function writeData") + 900);
assert.ok(!/revalidateTag\("lyra-data"\)/.test(writeData), "데이터 하나 저장이 모든 데이터 행을 비우지 않는다");
assert.match(writeData, /revalidateTag\(dataTag\(path\.basename\(name\)\)\)/);

// 사용량 점검은 의존성 없이 돈다(워크플로는 pnpm install을 하지 않는다)
const quota = read("../scripts/quota-watch.mjs");
assert.ok(!/^import dotenv/m.test(quota), "dotenv를 정적으로 불러오면 워크플로에서 점검이 죽는다");

// 곡마다 부르는 관리자 액션은 전곡을 읽지 않는다 — 직전 저장이 비운 샤드를 곡마다
// Neon에서 다시 받고, 전량(3.6MB)을 곡마다 파싱해 Vercel Active CPU까지 쓴다.
const songsApi = read("../app/api/admin/songs.js");
const block = (name) => {
  const at = songsApi.indexOf(`action === "${name}"`);
  return songsApi.slice(at, songsApi.indexOf('\n  if (action === "', at + 10));
};
assert.match(block("requalityOne"), /await getSongRuntime\(body\.slug\)/, "재번역 검토는 그 곡 하나만 읽는다");
assert.ok(!/getAllSongsRuntime/.test(block("requalityOne")));
assert.ok(!/getAllSongsRuntime/.test(block("regenGenre")), "장르 재분류는 이미 읽은 frontmatter에서 이전 장르를 본다");

console.log("✓ 저장은 바뀐 샤드·행·데이터만 비운다");
