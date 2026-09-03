import assert from "node:assert/strict";
import { parsePublishTargets } from "./admin/content-publish.js";

const options = { dataAllowlist: ["song-appearances.json"] };
assert.deepEqual(parsePublishTargets(["--song=ne", "--data=song-appearances.json", "--song=ne"], options), [
  { type: "song", slug: "ne", relativePath: "songs/ne.md" },
  { type: "data", name: "song-appearances.json", relativePath: "data/song-appearances.json" },
]);
assert.throws(() => parsePublishTargets([], options), /대상을/);
assert.throws(() => parsePublishTargets(["--song=../secret"], options), /잘못된/);
assert.throws(() => parsePublishTargets(["--data=search-index.json"], options), /허용되지 않은/);
console.log("targeted content publish passed");
