import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { publicationHistory } from "./publish-candidates.js";

test("publication history reports what was posted and when, newest first", () => {
  const history = publicationHistory({ items: [
    { kind: "movie", slug: "old", title: "옛 영화", publishedAt: "2026-08-20T09:00:00.000Z" },
    { kind: "song", slug: "ignored", publishedAt: "2026-08-30T09:00:00.000Z" },
    { kind: "movie", slug: "new", title: "새 영화", publishedAt: "2026-08-27T09:00:00.000Z" },
  ] });
  assert.deepEqual(history.map(({ slug, title, publishedAt }) => ({ slug, title, publishedAt })), [
    { slug: "new", title: "새 영화", publishedAt: "2026-08-27T09:00:00.000Z" },
    { slug: "old", title: "옛 영화", publishedAt: "2026-08-20T09:00:00.000Z" },
  ]);
});

test("publish queue renders history from the existing dataset", () => {
  const source = fs.readFileSync(new URL("../app/admin/publish-queue/page.js", import.meta.url), "utf8");
  assert.match(source, /publicationHistory\(published\)/);
  assert.match(source, /최근 발행 이력/);
  assert.match(source, /dateTime=\{item\.publishedAt\}/);
  assert.doesNotMatch(source, /create table|alter table/i);
});
