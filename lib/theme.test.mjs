// The no-flash script is a string built at module scope in layout.js. If THEME_KEY
// ever slips back behind a "use client" boundary it silently becomes undefined and
// the script reads localStorage.getItem(undefined) — pinned themes stop applying
// before first paint and every load flashes. Nothing else would fail.
//   node lib/theme.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { THEME_KEY } from "./theme.js";

assert.equal(typeof THEME_KEY, "string");
assert.ok(THEME_KEY.length, "THEME_KEY must be a non-empty string");

// the directive only counts as the first statement, so a mention in a comment is fine
const themeSrc = fs.readFileSync(new URL("./theme.js", import.meta.url), "utf8");
const firstStatement = themeSrc
  .split("\n")
  .find((l) => l.trim() && !l.trim().startsWith("//"));
assert.ok(
  !/^["']use client["']/.test(firstStatement.trim()),
  "lib/theme.js must not be a client module"
);

const layout = fs.readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
assert.ok(
  /import \{ THEME_KEY \} from "\.\.\/lib\/theme"/.test(layout),
  "layout.js must take THEME_KEY from lib/theme, not from the client component"
);

// rebuild the script the way layout.js does and check it embeds a real key
const NO_FLASH = `localStorage.getItem(${JSON.stringify(THEME_KEY)})`;
assert.ok(NO_FLASH.includes(`"${THEME_KEY}"`), "key must be inlined");
assert.ok(!NO_FLASH.includes("undefined"), "key must not serialize to undefined");

console.log("✓ THEME_KEY crosses the server boundary");
console.log("all passed");
