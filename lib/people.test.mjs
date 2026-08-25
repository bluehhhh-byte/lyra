import assert from "node:assert/strict";
import { getAllPeople, getPerson, splitCast } from "./people.js";

// splitCast는 문자열(.md)과 배열(데이터셋) 둘 다 받는다
assert.deepEqual(splitCast("A, B, C"), ["A", "B", "C"], "문자열");
assert.deepEqual(splitCast(["A", " B "]), ["A", "B"], "배열");
assert.deepEqual(splitCast(""), []);
assert.deepEqual(splitCast(null), []);

// getAllPeople은 정규화된 film 배열({key, director, cast[], rating, href})을 받는다
const films = [
  { key: "one", director: "감독", cast: ["배우", "감독"], rating: 4, href: "/movies/one" },
  { key: "two", director: "감독", cast: ["배우"], rating: 5, href: "https://www.themoviedb.org/movie/2" },
];
const people = getAllPeople(films);
const director = people.find((p) => p.name === "감독");
const actor = people.find((p) => p.name === "배우");
assert.equal(director.works.length, 2, "감독이 감독+배우로 겹쳐도 작품은 중복 없이 2편");
assert.equal(actor.works.length, 2, "배우 2편");
assert.equal(actor.averageRating, 4.5, "평균 별점");
// works가 film의 href를 그대로 들고 있어야 링크가 만들어진다
assert.ok(director.works.every((w) => w.href), "작품마다 href");
const detail = getPerson("감독", films);
assert.deepEqual(detail.directed.map((film) => film.key), ["one", "two"], "감독 축에 전작이 모두 남는다");
assert.equal(detail.directed[0].rating, 4, "감독 축에 별점을 보존한다");

console.log("✓ 인물 인덱스 — 감독·배우 중복 제거, 평균 별점, href 보존");
console.log("all passed");
