import assert from "node:assert/strict";
import { databaseContentEnabled, getContentDb } from "./content-db.js";

assert.equal(databaseContentEnabled({}), false);
assert.equal(databaseContentEnabled({ DATABASE_URL: "postgres://example" }), false, "URL만으로 운영 저장소를 바꾸지 않는다");
assert.equal(databaseContentEnabled({ LYRA_CONTENT_STORE: "github", DATABASE_URL: "postgres://example" }), false);
assert.equal(databaseContentEnabled({ LYRA_CONTENT_STORE: "neon" }), true);

assert.throws(
  () => getContentDb({ LYRA_CONTENT_STORE: "neon" }),
  /DATABASE_URL/,
  "명시적으로 Neon을 켰는데 URL이 없으면 조용히 GitHub로 떨어지지 않는다"
);

console.log("content-db config ok");
