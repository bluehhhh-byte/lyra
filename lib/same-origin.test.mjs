// admin 상태 변경 POST의 출처 검증 — 쿠키는 브라우저가 어디서든 실어 보내므로,
// 교차 출처 폼이 저장·삭제·배포를 부르지 못해야 한다.
import assert from "node:assert/strict";
import { sameOrigin } from "./admin/same-origin.js";

const req = (url, origin) =>
  new Request(url, { method: "POST", headers: origin === undefined ? {} : { origin } });

// same-origin — 스킴·호스트·포트가 전부 같아야 통과
assert.equal(sameOrigin(req("https://lyra.example/api/admin", "https://lyra.example")), true);
assert.equal(sameOrigin(req("http://localhost:3000/api/admin", "http://localhost:3000")), true);

// cross-origin — 거부
assert.equal(sameOrigin(req("https://lyra.example/api/admin", "https://evil.example")), false);
assert.equal(sameOrigin(req("https://lyra.example/api/admin", "https://lyra.example.evil.com")), false);
// 스킴이 다르면 다른 출처다 — host만 견주면 http↔https가 섞인다
assert.equal(sameOrigin(req("https://lyra.example/api/admin", "http://lyra.example")), false);
// 포트가 다르면 다른 출처다
assert.equal(sameOrigin(req("http://localhost:3000/api/admin", "http://localhost:4000")), false);

// missing-origin — 거부. 정당한 클라이언트는 admin 화면의 fetch뿐이고 브라우저는
// POST에 Origin을 항상 붙인다. 없다는 것은 브라우저가 아니라는 뜻이다.
assert.equal(sameOrigin(req("https://lyra.example/api/admin", undefined)), false);

// 망가진 Origin 값 — 거부 (throw가 아니라)
assert.equal(sameOrigin(req("https://lyra.example/api/admin", "not a url")), false);
assert.equal(sameOrigin(req("https://lyra.example/api/admin", "null")), false);

console.log("✓ same-origin — same·cross·missing");
