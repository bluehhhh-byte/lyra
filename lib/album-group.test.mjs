import assert from "node:assert/strict";
import { albumCompanions } from "./songs.js";
const one = { slug: "one", title: "One", artist: "A", album: "Album" };
const two = { slug: "two", title: "Two", artist: "A", album: "Album" };
assert.deepEqual(albumCompanions(one, [one, two]).map((song) => song.slug), ["two"]);
assert.deepEqual(albumCompanions(one, [one]), [], "앨범 한 곡뿐이면 묶지 않는다");
assert.deepEqual(albumCompanions(one, [one, { ...two, artist: "B" }]), [], "동명 앨범의 다른 아티스트는 섞지 않는다");
console.log("✓ 같은 아티스트·앨범이 둘 이상일 때만 앨범 묶음 생성");
