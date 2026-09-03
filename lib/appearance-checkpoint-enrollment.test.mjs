import assert from "node:assert/strict";
import { enrollAppearanceCheckpoint } from "./admin/research-budget.js";

const at = new Date("2026-09-04T00:00:00.000Z");
const first = enrollAppearanceCheckpoint({ totalSongs: 1, results: { old: { status: "complete" } } }, {
  slug: "new-song", title: "New Song", artist: "Artist",
}, { at });
assert.equal(first.added, true);
assert.equal(first.audit.results["new-song"].status, "pending");
assert.deepEqual(first.audit.results["new-song"].researchIdentity, { title: "New Song", artist: "Artist" });
assert.equal(first.audit.totalSongs, 2);
assert.equal(enrollAppearanceCheckpoint(first.audit, { slug: "new-song" }, { at }).added, false);
console.log("appearance checkpoint enrollment passed");
