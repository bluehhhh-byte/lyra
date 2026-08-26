import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { CAROUSEL_THEME } from "./carousel.js";
import { CAROUSEL_THEME as MOVIE_THEME } from "./movie-carousel.js";

test("song and movie carousels share the same canvas theme", () => {
  assert.strictEqual(MOVIE_THEME, CAROUSEL_THEME);
  assert.deepEqual(
    { width: CAROUSEL_THEME.width, height: CAROUSEL_THEME.height, padding: CAROUSEL_THEME.padding },
    { width: 1080, height: 1350, padding: 84 },
  );
});

test("both renderers consume the shared spacing and font constants", () => {
  for (const file of ["../app/songs/[slug]/lyric-card.js", "../app/admin/cyno-carousel/carousel-studio.js"]) {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /CAROUSEL_THEME\.width/);
    assert.match(source, /CAROUSEL_THEME\.height/);
    assert.match(source, /CAROUSEL_THEME\.padding/);
    assert.match(source, /CAROUSEL_THEME\.sans/);
    assert.match(source, /CAROUSEL_THEME\.serif/);
  }
});
