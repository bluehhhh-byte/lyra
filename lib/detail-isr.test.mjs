import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DETAIL_REVALIDATE_SECONDS,
  STATIC_SONG_LIMIT,
  recentStaticParams,
} from "./static-details.js";

const source = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

assert.equal(DETAIL_REVALIDATE_SECONDS, 21600, "상세 ISR은 콘텐츠 캐시와 같은 6시간이어야 한다");
assert.equal(STATIC_SONG_LIMIT, 100, "측정용 최근 곡 표본은 100개다");
assert.deepEqual(
  recentStaticParams([
    { slug: "old", date: "2020-01-01" },
    { slug: "new", published: "2026-01-01T00:00:00Z" },
    { slug: "middle", date: "2024-01-01" },
  ], 2),
  [{ slug: "new" }, { slug: "middle" }],
  "published || date 내림차순으로 최근 N개를 고른다"
);

for (const page of ["app/songs/[slug]/page.js", "app/movies/[slug]/page.js"]) {
  const text = source(page);
  assert.match(text, /export const dynamicParams = true;/, `${page}: 목록 밖 slug를 허용해야 한다`);
  assert.match(text, /export const revalidate = 21600;/, `${page}: 6시간 ISR이어야 한다`);
}

const moviesPage = source("app/movies/page.js");
assert.match(moviesPage, /export const revalidate = 21600;/, "/movies: 6시간 ISR이어야 한다");
assert.doesNotMatch(moviesPage, /searchParams/, "/movies: 쿼리 파라미터가 정적 생성을 막아서는 안 된다");

const store = source("lib/store.js");
assert.match(store, /revalidatePath\(kind === "song" \? `\/songs\/\$\{slug\}` : `\/movies\/\$\{slug\}`\);/,
  "관리자 저장은 해당 상세 경로를 무효화해야 한다");

console.log("detail ISR contract passed");
