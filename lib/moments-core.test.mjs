import assert from "node:assert/strict";
import { momentDateLabel, momentSlug, normalizeMoment, parseMomentList } from "./moments-core.js";

assert.equal(momentSlug("귀가하던 밤", "2021-12-01"), "2021-12-01-귀가하던-밤");
assert.deepEqual(parseMomentList("고독, 밤, 고독"), ["고독", "밤"]);
assert.equal(momentDateLabel({ startDate: "2021-12-01", endDate: "2021-12-03" }), "2021.12.01 — 2021.12.03");

const normalized = normalizeMoment({
  title: " 겨울의 기록 ", body: " 기억 ", startDate: "2021-12-01",
  emotions: ["고독", "고독"], keywords: "밤, 귀가", published: true,
  links: [
    { targetKind: "song", targetSlug: "one", excerpt: "line" },
    { targetKind: "song", targetSlug: "one", note: "last wins" },
    { targetKind: "movie", targetSlug: "two" },
  ],
});
assert.equal(normalized.title, "겨울의 기록");
assert.equal(normalized.links.length, 2);
assert.equal(normalized.links[0].note, "last wins");
assert.deepEqual(normalized.emotions, ["고독"]);
assert.throws(() => normalizeMoment({ title: "x", body: "y", startDate: "", links: [] }), /시작 날짜/);
assert.throws(() => normalizeMoment({ title: "x", body: "y", startDate: "2021-01-02", endDate: "2021-01-01", links: [{ targetSlug: "x" }] }), /종료 날짜/);
assert.throws(() => normalizeMoment({ title: "x", body: "y", startDate: "2021-01-02", links: [] }), /하나 이상/);

console.log("moments core ok");
