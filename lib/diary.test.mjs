import assert from "node:assert/strict";
import test from "node:test";
import { getDiary } from "./diary.js";

test("diary groups valid dates chronologically and tallies mood metadata", () => {
  const result = getDiary([
    { slug: "b", title: "B", artist: "A", date: "2026-08-28", emotion: "기쁨", keywords: ["밤", "밤"] },
    { slug: "a", title: "A", artist: "A", published: "2026-08-27", emotion: "슬픔", keywords: ["기억"] },
    { slug: "c", title: "C", artist: "A", date: "2026-08-27", emotion: "슬픔", keywords: ["기억", "밤"] },
    { slug: "invalid", date: "", emotion: "기쁨" },
  ]);
  assert.deepEqual(result.map((day) => day.day), ["2026-08-27", "2026-08-28"]);
  assert.equal(result[0].count, 2);
  assert.deepEqual(result[0].keywords, [["기억", 2], ["밤", 1]]);
  assert.equal(result[0].dominant, "슬픔");
  assert.ok(Number.isFinite(result[0].valence));
});

test("diary leaves valence null when emotions are absent", () => {
  assert.equal(getDiary([{ slug: "a", date: "2026-08-27", keywords: [] }])[0].valence, null);
});
