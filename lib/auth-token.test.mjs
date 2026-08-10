// admin 인증의 전부가 이 토큰 검증이다 — 위조·만료·비밀번호 변경이 다 막히는지.
//   node lib/auth-token.test.mjs
import assert from "node:assert/strict";
import { makeToken, verifyToken } from "./auth-token.js";

const t = await makeToken("secret");
assert.equal(await verifyToken("secret", t), true, "정상 토큰 통과");
console.log("✓ 발급한 토큰은 검증 통과");

assert.equal(await verifyToken("other", t), false, "비밀번호 바꾸면 기존 토큰 전부 무효");
assert.equal(await verifyToken("secret", t.slice(0, -1) + "0"), false, "서명 변조");
const [exp] = t.split(".");
assert.equal(await verifyToken("secret", `${+exp + 999}.${t.split(".")[1]}`), false, "만료 연장 변조");
console.log("✓ 위조·변조 거부");

assert.equal(await verifyToken("secret", `${Date.now() - 1000}.abc`), false, "만료 토큰");
assert.equal(await verifyToken("secret", ""), false, "빈 값");
assert.equal(await verifyToken("secret", null), false, "null");
assert.equal(await verifyToken("", t), false, "secret 없으면 무조건 거부");
console.log("✓ 만료·빈 값·무secret 거부");

console.log("all passed");
