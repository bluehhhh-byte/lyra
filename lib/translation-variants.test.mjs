import assert from "node:assert/strict";
import { artistTranslationVariants, translationVariants } from "./translation-variants.js";

const split = translationVariants([
  { en: "Lost boys", ko: "길 잃은 소년들은" },
  { en: " Lost boys ", ko: "길 잃은 소년들이여" },
  { en: "Lost boys", ko: "길 잃은 소년들은" },
  { en: "Another line", ko: "다른 구절" },
]);
assert.deepEqual(split, [{
  original: "Lost boys",
  translations: ["길 잃은 소년들은", "길 잃은 소년들이여"],
}]);

assert.deepEqual(translationVariants([
  { en: "Same", ko: "같아" },
  { en: "Same", ko: "같아" },
  { en: "Missing", ko: "" },
]), []);

const acrossSongs = artistTranslationVariants([
  { slug: "one", title: "One", artist: "Artist", stanzas: [{ lines: [{ en: "Stay with me", ko: "내 곁에 있어" }, { en: "Solo", ko: "혼자" }, { en: "Solo", ko: "홀로" }] }] },
  { slug: "two", title: "Two", artist: "Artist", stanzas: [{ lines: [{ en: " stay with me ", ko: "나와 함께 있어" }] }] },
  { slug: "three", title: "Three", artist: "Other", stanzas: [{ lines: [{ en: "Stay with me", ko: "머물러" }] }] },
]);
assert.equal(acrossSongs.length, 1, "같은 아티스트의 서로 다른 곡만 교차 진단한다");
assert.equal(acrossSongs[0].artist, "Artist");
assert.equal(acrossSongs[0].songCount, 2);
assert.deepEqual(acrossSongs[0].variants.map((row) => row.translation), ["내 곁에 있어", "나와 함께 있어"]);

console.log("translation variants passed");
