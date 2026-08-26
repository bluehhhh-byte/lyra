import assert from "node:assert/strict";
import { auditSlugs, canonicalSlug } from "./slug-integrity.js";

assert.equal(canonicalSlug("The Artist", "夢の Song!"), "the-artist-夢の-song");
assert.deepEqual(
  auditSlugs(
    [{ slug: "artist-title", artist: "Artist", title: "Title" }],
    [{ slug: "artist-title", title: "Movie", year: "2026" }, { slug: "legacy", title: "New", year: "2025" }],
  ),
  {
    crossCollisions: ["artist-title"],
    regenerated: [
      { kind: "movie", slug: "artist-title", expected: "movie-2026" },
      { kind: "movie", slug: "legacy", expected: "new-2025" },
    ],
  },
);
