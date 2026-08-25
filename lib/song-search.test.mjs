import assert from "node:assert/strict";
import { filterAdminSongs, normalizeSongSearch } from "./admin/song-search.js";

const songs = [
  { slug: "holiday", title: "Holiday", artist: "Green Day" },
  { slug: "ending", title: "세계의 끝", artist: "유우리" },
  { slug: "feels", title: "Feels", artist: "Calvin Harris" },
];

assert.equal(normalizeSongSearch("  Green   DAY  "), "green day");
assert.deepEqual(filterAdminSongs(songs, "holiday").map((song) => song.slug), ["holiday"]);
assert.deepEqual(filterAdminSongs(songs, "GREEN day").map((song) => song.slug), ["holiday"]);
assert.deepEqual(filterAdminSongs(songs, "세계 유우리").map((song) => song.slug), ["ending"]);
assert.deepEqual(filterAdminSongs(songs, "없는 곡"), []);
assert.equal(filterAdminSongs(songs, ""), songs, "빈 검색어는 원래 배열을 그대로 반환해야 한다");

console.log("admin song search contract passed");
