import assert from "node:assert/strict";
import { specialWhitespaceAt, summarizeSpecialWhitespace } from "./special-whitespace.js";

const source = "normal space\nquarter 读\n전각　공백\nnbsp here";
const hits = specialWhitespaceAt(source);
assert.deepEqual(hits.map(({ line, code }) => ({ line, code })), [
  { line: 2, code: "U+2005" },
  { line: 3, code: "U+3000" },
  { line: 4, code: "U+00A0" },
]);
assert.match(summarizeSpecialWhitespace(hits), /2:\d+ U\+2005/);
assert.equal(specialWhitespaceAt("ordinary\twhitespace").length, 0, "일반 공백과 탭은 보고하지 않는다");
