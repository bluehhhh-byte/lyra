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

// 붙여넣기가 끌고 온 보이지 않는 문자 때문에 스위치가 이틀 동안 꺼져 있었다.
// 값은 "neon"이 아니라 BOM이 앞에 붙은 "\uFEFFneon"이었고, 화면에는 neon으로 보였다.
assert.equal(databaseContentEnabled({ LYRA_CONTENT_STORE: "\uFEFFneon" }), true, "BOM이 붙어도 켜진다");
assert.equal(databaseContentEnabled({ LYRA_CONTENT_STORE: " neon\n" }), true, "앞뒤 공백도 다듬는다");
assert.equal(databaseContentEnabled({ LYRA_CONTENT_STORE: '"neon"' }), true, "따옴표째 들어와도 켜진다");
assert.equal(databaseContentEnabled({ LYRA_CONTENT_STORE: "NEON" }), true, "대소문자는 구분하지 않는다");
assert.equal(databaseContentEnabled({ LYRA_CONTENT_STORE: "neon-staging" }), false, "다듬는 것과 아무 값이나 받는 것은 다르다");

// DATABASE_URL도 같은 붙여넣기에서 왔다. 스위치를 고치자마자 이 값이
// "not a valid URL"로 빌드를 깨뜨렸다.
assert.doesNotThrow(
  () => getContentDb({ LYRA_CONTENT_STORE: "neon", DATABASE_URL: "\uFEFFpostgresql://u:p@h/db" }),
  "BOM이 붙은 연결 문자열도 받는다"
);
assert.throws(
  () => getContentDb({ LYRA_CONTENT_STORE: "neon", DATABASE_URL: "oops" }),
  /로 시작하지 않습니다/,
  "형식이 틀리면 값을 흘리지 않고 무엇이 틀렸는지 말한다"
);
