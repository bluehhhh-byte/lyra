import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lyra-movies-"));
fs.mkdirSync(path.join(dir, "movies"));
fs.writeFileSync(
  path.join(dir, "movies", "watching.md"),
  "---\ntitle: Watching\nstatus: watching\nepisode: 7\ntags: [Drama]\n---\nSynopsis\n"
);
fs.writeFileSync(
  path.join(dir, "movies", "legacy.md"),
  "---\ntitle: Legacy\ntags: [Drama]\n---\nSynopsis\n"
);
process.chdir(dir);

const { getAllMovies } = await import(`${new URL("./movies.js", import.meta.url).href}?watch-status`);
const movies = getAllMovies();
assert.equal(movies.find((movie) => movie.title === "Watching").watchStatus, "watching");
assert.equal(movies.find((movie) => movie.title === "Watching").episode, 7);
assert.equal(movies.find((movie) => movie.title === "Legacy").watchStatus, "watched");

process.chdir(root);
fs.rmSync(dir, { recursive: true, force: true });
console.log("✓ movie watch status parses and legacy entries default to watched");
console.log("all passed");
