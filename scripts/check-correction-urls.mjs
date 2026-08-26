// 교정 근거 URL 읽기 전용 검사. 상태만 출력하며 교정 기록을 수정하거나 지우지 않는다.
import fs from "node:fs";
import { correctionUrlInventory, urlHealth } from "../lib/url-health.js";

const data = JSON.parse(fs.readFileSync("data/lyrics-corrections.json", "utf8"));
const rows = correctionUrlInventory(Array.isArray(data.items) ? data.items : []);
const missing = rows.filter((row) => !row.url);
const results = [];

for (const row of rows.filter((item) => item.url)) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    let response = await fetch(row.url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (response.status === 405) response = await fetch(row.url, { method: "GET", redirect: "follow", signal: controller.signal });
    results.push({ ...row, status: response.status, health: urlHealth(response.status) });
  } catch (error) {
    results.push({ ...row, status: 0, health: "dead", error: error.name });
  } finally {
    clearTimeout(timer);
  }
}

console.log(`교정 기록 ${rows.length}건 · URL 확인 ${results.length}건 · URL 누락 ${missing.length}건`);
for (const row of missing) console.log(`  URL 누락 #${row.index + 1} ${row.slug}`);
for (const row of results) console.log(`  ${row.health} HTTP ${row.status} ${row.slug} ${row.url}${row.error ? ` (${row.error})` : ""}`);
const dead = results.filter((row) => row.health === "dead");
console.log(`죽은 링크 ${dead.length}건 · 접근 제한 ${results.filter((row) => row.health === "blocked").length}건`);
if (missing.length || dead.length) process.exitCode = 1;
