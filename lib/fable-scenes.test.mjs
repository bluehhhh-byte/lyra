import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [scenes, home, song, lyrics, wall] = await Promise.all([
  readFile(new URL("../app/fable-scenes.js", import.meta.url), "utf8"),
  readFile(new URL("../app/home-intro.js", import.meta.url), "utf8"),
  readFile(new URL("../app/songs/[slug]/page.js", import.meta.url), "utf8"),
  readFile(new URL("../app/songs/[slug]/lyrics-view.js", import.meta.url), "utf8"),
  readFile(new URL("./fable/wall.js", import.meta.url), "utf8"),
]);

assert.match(scenes, /latestArtworkPlan\(latest\)/);
assert.match(scenes, /data-latest-day-seed=\{plan\.seed\}/);
assert.match(scenes, /hand\.enso\(/);
assert.match(scenes, /hand\.spark\(/);
assert.match(scenes, /hand\.atext\(/);
assert.match(scenes, /hand\.threadSeg\(/);
assert.match(scenes, /document\.fonts\?\.ready/);
assert.match(scenes, /ResizeObserver/);
assert.doesNotMatch(scenes, /audioRef|AnalyserNode/);
assert.match(home, /<LatestDayScene latest=\{latest\}/);
assert.match(song, /<FableSongScene/);
assert.match(song, /data-song-artwork/);
assert.match(lyrics, /<LyricThread/);
assert.match(lyrics, /data-fable-stanza/);
assert.match(wall, /maxPixelRatio = 2/);

console.log("✓ Fable 장면 — P0 홈·P1 곡·금색 가사 실·DOM 앵커 계약");
