// 인물 캐시 회귀 검사.
// 전체 작품 객체를 2,545명에게 반복해서 붙이면 2MiB 한도를 넘는다. 목록은 경량
// 요약만, 상세는 이름별 한 건만 보관한다.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAllPeople, getPeopleSummaries, getPerson } from "./people.js";

const LIMIT = 2 * 1024 * 1024;
const summaries = getPeopleSummaries();
const summaryBytes = Buffer.byteLength(JSON.stringify(summaries));
assert.ok(summaryBytes < LIMIT, `인물 목록 캐시 ${summaryBytes} bytes — 2MiB를 넘으면 안 된다`);
assert.ok(summaries.length > 2_000, "실데이터 전체 인물로 검사해야 한다");
assert.ok(summaries.every((person) => !("works" in person)), "목록에 작품 객체 배열이 들어가면 안 된다");

const full = getAllPeople();
const busiest = full.reduce((best, person) => person.works.length > best.works.length ? person : best);
const detail = getPerson(busiest.name);
const detailBytes = Buffer.byteLength(JSON.stringify(detail));
assert.ok(detailBytes < LIMIT, `가장 큰 인물 상세 캐시 ${detailBytes} bytes — 2MiB를 넘으면 안 된다`);
assert.deepEqual(detail.works.map((work) => work.key), busiest.works.map((work) => work.key));

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "lib/people.js"), "utf8");
const runtimeBody = source.match(/export async function getPersonRuntime[\s\S]*?\r?\n}\r?\n/)?.[0] || "";
assert.ok(runtimeBody, "getPersonRuntime 구현을 찾지 못했다");
assert.ok(!runtimeBody.includes("getAllPeopleRuntime"), "상세가 전체 인물 캐시를 조회하면 안 된다");
assert.match(runtimeBody, /getPerson\(name, allFilms/, "상세는 해당 인물만 구성해야 한다");

console.log(`  인물 요약 ${summaries.length}명: ${(summaryBytes / 1024).toFixed(0)}KB`);
console.log(`  최대 상세 ${busiest.name} ${detail.works.length}편: ${(detailBytes / 1024).toFixed(1)}KB`);
console.log("인물 캐시 — 목록·상세 모두 2MiB 미만, 상세 전량 재집계 없음");
