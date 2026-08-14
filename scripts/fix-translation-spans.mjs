// `>^N` 범위가 실제 줄 수보다 크게 잡힌 곳을 바로잡는다.
//   node scripts/fix-translation-spans.mjs [--write]
//
// merge-translation-spans.mjs는 `>` 위에 연속으로 붙은 '번역 없는 원문' 줄을 세어
// 범위를 매겼다. 그런데 캡션에는 원문을 먼저 다 적고 번역을 아래에 몰아 쓴 글이 많다.
//
//   Beyond the point        ← 원문 3줄
//   Of no return
//   Of no return
//   >^3 이젠 너무 늦어버렸어  ← 첫 번역이 원문 3줄을 다 덮는 것으로 잡혔다
//   > 이미 너무 망가져버렸지   ← 그래서 이 두 줄은 덮을 원문이 남지 않아
//   > 상처가 생겨버렸어        ← 화면에서 통째로 사라진다
//
// 번역 개수와 원문 줄 수가 같으면 1:1로 맞는 것이므로 접두사를 전부 `>`로 되돌린다.
// 개수가 다르면 어느 줄을 덮는지 자동으로 알 수 없어 손대지 않고 목록으로 남긴다.
import fs from "fs";
import { guard } from "../lib/admin/preflight.js";

const WRITE = process.argv.includes("--write");
if (WRITE) guard();

const isTr = (l) => /^>(\^\d+)?\s/.test(l.trim());
const isSkip = (l) => { const t = l.trim(); return !t || /^\+/.test(t) || /^\/\//.test(t) || /^\[.*\]$/.test(t) || /^[🗨✏]/u.test(t); };

let fixedLines = 0, fixedFiles = 0;
const review = [];

for (const f of fs.readdirSync("songs").filter((x) => x.endsWith(".md"))) {
  const raw = fs.readFileSync(`songs/${f}`, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n[\s\S]*?\n---\n?/);
  if (!m) continue;
  const head = m[0];
  const lines = raw.slice(head.length).split("\n");

  let pending = 0, hits = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { pending = 0; continue; }        // 빈 줄 = 문단 경계
    if (isSkip(lines[i])) continue;
    if (!isTr(lines[i])) { pending++; continue; }

    // 번역이 연속으로 붙은 구간을 통째로 본다
    let j = i;
    const run = [];
    while (j < lines.length && isTr(lines[j])) { run.push(j); j++; }
    const slots = run.reduce((n, k) => n + Number((lines[k].trim().match(/^>\^(\d+)/) || [, 1])[1]), 0);

    if (slots > pending) {
      if (run.length === pending) {
        for (const k of run) lines[k] = lines[k].replace(/^(\s*)>\^\d+\s/, "$1> ");
        hits += run.length;
      } else {
        review.push(`${f}: 원문 ${pending}줄에 번역 ${run.length}개(${slots}칸) — 개수가 달라 손대지 않음`);
      }
    }
    pending = 0;
    i = j - 1;
  }

  if (hits) {
    fixedFiles++; fixedLines += hits;
    console.log(`${f}: ${hits}줄`);
    if (WRITE) fs.writeFileSync(`songs/${f}`, head + lines.join("\n"));
  }
}

for (const r of review) console.log(`  ! ${r}`);
console.log(`\n곡 ${fixedFiles} · 접두사 ${fixedLines}줄 되돌림${WRITE ? "" : " (미리보기 — 쓰려면 --write)"}`);
if (review.length) console.log(`검토 필요 ${review.length}건`);
