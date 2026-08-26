import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const header = read("../app/header.js");
const theme = read("../app/theme-toggle.js");
const player = read("../app/player.js");
const lyrics = read("../app/songs/[slug]/lyrics-view.js");

assert.doesNotMatch(header, /className="flex h-8|className=\{`h-8 w-8/);
assert.match(theme, /min-h-11 min-w-11/);
assert.doesNotMatch(player, /h-(?:8|10) w-(?:8|10) shrink-0 items-center justify-center rounded-full/);
assert.match(lyrics, /className=\{`h-11 w-11 rounded-full/);
assert.match(lyrics, /flex h-11 w-11 items-center justify-center/);
