import assert from "node:assert/strict";
import { translationVariants } from "./translation-variants.js";

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

console.log("translation variants passed");
