// Instagram caption format must match the agreed template exactly.
//   node --test lib/caption.test.mjs
import assert from "node:assert/strict";
import { buildCaption } from "./caption.js";

// 2026-07-14 15:31 local (month is 0-based in the Date constructor)
const now = new Date(2026, 6, 14, 15, 31);

assert.equal(
  buildCaption({ artist: "SUEDE", title: "Trash", year: "1998" }, now),
  "| SUEDE - Trash (1998) #SUEDE #260714_1531 #음악로그"
);

// spaces + punctuation in the artist name collapse into one hashtag
assert.ok(
  buildCaption({ artist: "The Weeknd", title: "Cry For Me", year: "2025" }, now).includes("#TheWeeknd ")
);

// Korean artist, missing year → no "(…)" tail, Korean hashtag intact
assert.equal(
  buildCaption({ artist: "뉴진스", title: "Supernatural", year: "" }, now),
  "| 뉴진스 - Supernatural #뉴진스 #260714_1531 #음악로그"
);

console.log("✓ caption format matches template");
console.log("all passed");
