import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-movies-"));
fs.mkdirSync(path.join(dir, "movies"));
fs.writeFileSync(
  path.join(dir, "movies", "lemon.md"),
  "---\ntitle: Lemon\nyear: 2018\nrating: 4\ntags: [일본, Drama, 2018]\n---\n줄거리 문단.\n"
);
process.chdir(dir);

const { getAllMovies } = await import(`${new URL("./movies.js", import.meta.url).href}?t`);
const movies = getAllMovies();
const m = movies.find((movie) => movie.title === "Lemon");
assert.equal(m.rating, 4, "rating을 숫자로 파싱");
assert.deepEqual(m.tags, ["일본", "Drama", "2018"], "tags 배열");
assert.ok(m.synopsis.length >= 1, "본문을 문단으로 분리");

process.chdir(root);
fs.rmSync(dir, { recursive: true, force: true });
console.log("✓ 영화 markdown 파싱 (rating·tags·synopsis)");
console.log("all passed");
