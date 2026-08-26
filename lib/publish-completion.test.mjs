import assert from "node:assert/strict";
import fs from "node:fs";
import { completePublication, publishCandidates, publishedMovieSlugs } from "./publish-candidates.js";

const first = completePublication({ items: [] }, { slug: "movie-a", title: "영화 A" }, () => "2026-08-27T00:00:00.000Z");
assert.deepEqual([...publishedMovieSlugs(first)], ["movie-a"]);
const replaced = completePublication(first, { slug: "movie-a", title: "영화 A" }, () => "2026-08-28T00:00:00.000Z");
assert.equal(replaced.items.length, 1, "같은 작품의 완료 기록을 중복 저장하면 안 된다");
assert.equal(replaced.items[0].publishedAt, "2026-08-28T00:00:00.000Z");

const movie = (slug) => ({ slug, title: slug, published: "2026-08-20", poster: "/poster.jpg", comment: "감상", themes: [] });
const queue = publishCandidates([movie("movie-a"), movie("movie-b")], { published: first });
assert.deepEqual(queue.recent.map((item) => item.slug), ["movie-b"], "완료 작품은 다음 대기열에서 빠져야 한다");

const page = fs.readFileSync(new URL("../app/admin/publish-queue/page.js", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../app/admin/publish-queue/publish-candidate-card.js", import.meta.url), "utf8");
const handler = fs.readFileSync(new URL("../app/api/admin/publish.js", import.meta.url), "utf8");
assert.match(page, /readRuntimeData\("instagram-published\.json"/);
assert.match(client, /action: "publishComplete"/);
assert.match(handler, /writeData\("instagram-published\.json"/);
assert.doesNotMatch(handler, /create table|alter table/i, "새 DB 테이블을 만들면 안 된다");

console.log("발행 완료 상태 검증 통과");
