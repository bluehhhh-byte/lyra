import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const view = readFileSync(new URL("../app/songs/[slug]/lyrics-view.js", import.meta.url), "utf8");

assert.match(css, /@media print[\s\S]*header,[\s\S]*footer,[\s\S]*nav,[\s\S]*button,[\s\S]*display: none !important/);
assert.match(css, /@media print[\s\S]*background: #fff !important[\s\S]*color: #000 !important/);
assert.match(css, /\[data-lyric-view\] \.reveal[\s\S]*break-inside: avoid/);
assert.match(view, /data-lyric-view/);
assert.match(view, /data-reader-toolbar/);
