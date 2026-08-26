import assert from "node:assert/strict";
import { artistEmotionProfiles, getAllPeople, getPeopleSummaries, getPerson, splitCast } from "./people.js";

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
const actorSummary = getPeopleSummaries(films).find((person) => person.name === "배우");
assert.equal(actorSummary.actedCount, 2);
assert.equal(actorSummary.actorAverageRating, 4.5, "배우 출연작만으로 평균을 낸다");

const artistProfiles = artistEmotionProfiles([
  { artist: "다곡", emotion: "기쁨" }, { artist: "다곡", emotion: "희망" }, { artist: "다곡", emotion: "설렘" },
  { artist: "소곡", emotion: "슬픔" }, { artist: "소곡", emotion: "고독" },
]);
const many = artistProfiles.find((profile) => profile.artist === "다곡");
const few = artistProfiles.find((profile) => profile.artist === "소곡");
assert.equal(many.deferred, false);
assert.equal(many.type, "밝은 확장");
assert.match(many.summary, /기록은/);
assert.doesNotMatch(many.summary, /아티스트는/);
assert.equal(few.deferred, true);
assert.equal(few.type, "판단 유보");
assert.match(few.summary, /단정하지 않는다/);

console.log("✓ 인물 인덱스 — 감독·배우 중복 제거, 평균 별점, href 보존");
console.log("✓ 아티스트별 기록 감정 — 표본 부족 유보·사람 판정 금지");
console.log("all passed");
