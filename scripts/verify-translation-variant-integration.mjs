import assert from "node:assert/strict";
import fs from "node:fs";

const lint = fs.readFileSync("scripts/lint-data.mjs", "utf8");
assert.match(lint, /import \{ translationVariants \} from "\.\.\/lib\/translation-variants\.js";/);
assert.match(lint, /const split = translationVariants\(lines\)\.length;/);
assert.doesNotMatch(lint, /const byLine = new Map\(\)/, "린트에 판정 복사본을 남기지 않는다");
console.log("translation variant integration passed");
