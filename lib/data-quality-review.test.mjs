import assert from "node:assert/strict";
import {
  buildTranslationReviewIndex,
  needsLyricMetadata,
  unresolvedTranslationVariants,
  unreviewedEchoLines,
} from "./data-quality-review.js";

const snapshot = {
  records: [{ id: "song\u0000Same", category: "context_justified" }, { id: "song\u0000Open", category: "hold" }],
  echoReview: [{ slug: "song", original: "Yeah", decision: "retain" }],
};
const index = buildTranslationReviewIndex(snapshot);
assert.deepEqual(unresolvedTranslationVariants("song", [{ original: "Same" }, { original: "Open" }], index), [{ original: "Open" }]);
assert.deepEqual(unreviewedEchoLines("song", [
  { en: "Yeah", ko: "Yeah" },
  { en: "Word", ko: "Word" },
], index), [{ en: "Word", ko: "Word" }]);
assert.equal(needsLyricMetadata({ instrumental: true }), false);
assert.equal(needsLyricMetadata({ lyrics_none: true }), false);
assert.equal(needsLyricMetadata({}), true);

console.log("data quality review tests passed");
