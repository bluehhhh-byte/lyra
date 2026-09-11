import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

process.env.TMDB_API_KEY ||= "test-key";
const { TmdbError, tmdbErrorFor, __tmdbFetch, __clearTmdbCache } = await import("./tmdb.js");

const res = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => body,
});

test("each status becomes an error a person can act on", () => {
  // "TMDB 502"는 무엇을 하라는 말도 아니다
  assert.equal(tmdbErrorFor(401).kind, "auth");
  assert.match(tmdbErrorFor(401).message, /키가 거부/);
  assert.match(tmdbErrorFor(401).message, /공백·따옴표/, "BOM 사고를 겪은 적이 있으니 그걸 먼저 의심하게 한다");
  assert.equal(tmdbErrorFor(403).kind, "auth");
  assert.equal(tmdbErrorFor(404).kind, "not_found");
  assert.equal(tmdbErrorFor(429).kind, "rate_limit");
  assert.equal(tmdbErrorFor(429).retryable, true);
  assert.equal(tmdbErrorFor(503).kind, "server");
  assert.equal(tmdbErrorFor(418).kind, "unknown");
  assert.match(tmdbErrorFor(429, 7).message, /7초/, "서버가 말한 대기 시간을 그대로 전한다");
});

test("a 429 with Retry-After is retried exactly once, after that wait", async () => {
  __clearTmdbCache();
  const waits = [];
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return calls === 1 ? res(429, {}, { "retry-after": "2" }) : res(200, { results: [] });
  };
  const body = await __tmdbFetch("/search/multi", { query: "a" }, { fetchImpl, sleep: (ms) => { waits.push(ms); } });
  assert.deepEqual(body, { results: [] });
  assert.equal(calls, 2, "한 번만 더 시도한다");
  assert.deepEqual(waits, [2000], "서버가 말한 만큼만 기다린다");
});

test("a 429 without Retry-After is not retried", async () => {
  __clearTmdbCache();
  let calls = 0;
  const fetchImpl = async () => { calls++; return res(429); };
  await assert.rejects(
    () => __tmdbFetch("/search/multi", { query: "b" }, { fetchImpl, sleep: async () => {} }),
    (error) => error instanceof TmdbError && error.kind === "rate_limit",
  );
  // 대기 시간을 지어내면 그게 폭주의 시작이다
  assert.equal(calls, 1);
});

test("an auth failure is never retried", async () => {
  __clearTmdbCache();
  let calls = 0;
  const fetchImpl = async () => { calls++; return res(401); };
  await assert.rejects(() => __tmdbFetch("/movie/1", {}, { fetchImpl }), /키가 거부/);
  assert.equal(calls, 1, "키가 틀린 요청을 다시 보내 봐야 같은 답이다");
});

test("a repeated search does not spend a second call", async () => {
  __clearTmdbCache();
  let calls = 0;
  const fetchImpl = async () => { calls++; return res(200, { results: [{ id: 1 }] }); };
  const a = await __tmdbFetch("/search/multi", { query: "같은 검색" }, { fetchImpl });
  const b = await __tmdbFetch("/search/multi", { query: "같은 검색" }, { fetchImpl });
  assert.deepEqual(a, b);
  assert.equal(calls, 1);

  // 다른 검색어는 따로 센다
  await __tmdbFetch("/search/multi", { query: "다른 검색" }, { fetchImpl });
  assert.equal(calls, 2);
});

test("the key is read through the same normaliser as the rest", () => {
  const source = fs.readFileSync(new URL("./tmdb.js", import.meta.url), "utf8");
  assert.match(source, /cleanEnv\(process\.env\.TMDB_API_KEY\)/);
  assert.match(source, /\\uFEFF|﻿/, "BOM을 걷어내야 한다");
});

test("the cache is bounded so a long session cannot grow without limit", () => {
  const source = fs.readFileSync(new URL("./tmdb.js", import.meta.url), "utf8");
  assert.match(source, /CACHE_MAX = 200/);
  assert.match(source, /while \(cache\.size > CACHE_MAX\)/);
  assert.match(source, /서버리스라 인스턴스마다 따로 살고/, "인스턴스 로컬 캐시라는 사실을 적어 둔다");
});
