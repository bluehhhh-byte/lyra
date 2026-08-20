// 이미 붙어 있는 번역을 교체한다. apply-translations.mjs는 비어 있는 줄에만
// 붙이므로, 잘못 번역된 줄을 고칠 때는 이쪽을 쓴다.
//
//   node scripts/retranslate.mjs <file.json>            파일에 쓴다
//   node scripts/retranslate.mjs <file.json> --check    무엇이 바뀌는지만 본다
//
// 입력 형식은 apply-translations.mjs와 같다:
//   { "songs": { "<slug>": { "map": { "<원문 줄>": "<새 번역>" } } } }
//
// 원문 줄은 절대 건드리지 않는다 — 바꾸는 것은 그 아래 `>` 줄뿐이다.
// 원문에 없는 키는 조용히 넘어가지 않고 보고한다. 가사가 바뀐 줄에 옛 번역을
// 붙이는 사고를 막는다.
import fs from "node:fs";
import path from "node:path";

const [input, ...flags] = process.argv.slice(2);
if (!input) throw new Error("사용법: node scripts/retranslate.mjs <file.json> [--check]");
const checkOnly = flags.includes("--check");

const root = process.cwd();
const data = JSON.parse(fs.readFileSync(input, "utf8"));

// 보이지 않는 문자·공백 차이로 원문을 못 찾는 사고가 실제로 있었다(U+2005 등).
const norm = (s) => s.replace(/[​-‍﻿]/g, "").replace(/\s/g, " ").trim();

let changed = 0;
let same = 0;
const missing = [];
const touched = [];

for (const [slug, { map }] of Object.entries(data.songs || {})) {
  const file = path.join(root, "songs", `${slug}.md`);
  if (!fs.existsSync(file)) {
    missing.push(`${slug}: 파일 없음`);
    continue;
  }
  const raw = fs.readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const wanted = new Map(Object.entries(map).map(([k, v]) => [norm(k), v]));
  const seen = new Set();
  let fileChanged = 0;

  for (let i = 0; i < lines.length; i++) {
    const src = lines[i].trim();
    if (!src || src.startsWith(">") || src.startsWith("+") || src.startsWith("//") || /^\[.*\]$/.test(src)) continue;
    const want = wanted.get(norm(src));
    if (want === undefined) continue;
    seen.add(norm(src));

    const next = (lines[i + 1] || "").trim();
    if (!next.startsWith(">")) continue; // 번역이 없는 줄 — 여기서 새로 붙이지 않는다
    // `>^N`(여러 줄을 덮는 번역)의 범위 표기는 보존한다
    const marker = next.match(/^>\^?\d*/)[0];
    const current = next.slice(marker.length).trim();
    if (current === want) {
      same++;
      continue;
    }
    lines[i + 1] = `${marker} ${want}`;
    fileChanged++;
    if (touched.length < 12) touched.push(`  ${src}\n    - ${current}\n    + ${want}`);
  }

  for (const key of wanted.keys()) if (!seen.has(key)) missing.push(`${slug}: ${key.slice(0, 40)}`);

  if (fileChanged && !checkOnly) fs.writeFileSync(file, lines.join(eol));
  changed += fileChanged;
}

console.log(touched.join("\n"));
console.log(
  `${checkOnly ? "[미리보기] " : ""}번역 교체 ${changed}줄 · 이미 같아서 건너뜀 ${same} · 원문을 못 찾은 항목 ${missing.length}`
);
if (missing.length) console.log("못 찾음:\n  " + missing.slice(0, 10).join("\n  "));
