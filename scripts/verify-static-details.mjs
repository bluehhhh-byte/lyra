import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STATIC_SONG_LIMIT } from "../lib/static-details.js";

const manifest = JSON.parse(readFileSync(".next/prerender-manifest.json", "utf8"));
const routes = Object.keys(manifest.routes);
assert.equal(manifest.routes["/movies"]?.initialRevalidateSeconds, 21600, "/movies는 6시간 ISR이어야 합니다");
const songRoutes = routes.filter(
  (route) => route.startsWith("/songs/") && !["/songs/motifs", "/songs/taste"].includes(route)
);
const movieRoutes = routes.filter((route) => route.startsWith("/movies/") && route.split("/").length === 3);

assert.equal(songRoutes.length, STATIC_SONG_LIMIT, "최근 곡 정적 생성 수가 다릅니다");
assert.equal(movieRoutes.length, 50, "영화 상세 50편을 전량 정적 생성해야 합니다");
for (const route of [...songRoutes, ...movieRoutes]) {
  assert.equal(manifest.routes[route].initialRevalidateSeconds, 21600, `${route}: revalidate가 6시간이 아닙니다`);
}

console.log(JSON.stringify({ songs: songRoutes.length, movies: movieRoutes.length, total: routes.length }));
console.log("static detail verification passed");
