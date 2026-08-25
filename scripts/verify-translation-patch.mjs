import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { parseFrontmatter } from "../lib/songs.js";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).replace(/\r\n/g, "\n");
const workingSongChanges = git("-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--", "songs")
  .trim().split("\n").filter((file) => file.endsWith(".md"));
const base = process.env.TRANSLATION_AUDIT_BASE || (workingSongChanges.length ? "HEAD" : "HEAD^");
const files = git("-c", "core.quotepath=false", "diff", "--name-only", base, "--", "songs")
  .trim().split("\n").filter((file) => file.endsWith(".md"));

assert.ok(files.length > 0, `${base} 이후 번역 변경 파일이 없습니다`);

let addedTranslations = 0;
let removedTranslations = 0;
for (const file of files) {
  const before = git("show", `${base}:${file}`);
  const after = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const beforeOriginal = beforeLines.filter((line) => !line.startsWith(">"));
  const afterOriginal = afterLines.filter((line) => !line.startsWith(">"));

  assert.deepEqual(afterOriginal, beforeOriginal, `${file}: 번역 줄 밖의 원문·메타데이터가 바뀌었습니다`);
  assert.equal(parseFrontmatter(after).meta.source_hash, parseFrontmatter(before).meta.source_hash,
    `${file}: source_hash가 바뀌었습니다`);

  const beforeTranslations = beforeLines.filter((line) => line.startsWith(">"));
  const afterTranslations = afterLines.filter((line) => line.startsWith(">"));
  const beforeCounts = new Map();
  const afterCounts = new Map();
  for (const line of beforeTranslations) beforeCounts.set(line, (beforeCounts.get(line) || 0) + 1);
  for (const line of afterTranslations) afterCounts.set(line, (afterCounts.get(line) || 0) + 1);
  for (const [line, count] of beforeCounts) removedTranslations += Math.max(0, count - (afterCounts.get(line) || 0));
  for (const [line, count] of afterCounts) addedTranslations += Math.max(0, count - (beforeCounts.get(line) || 0));
}

assert.ok(addedTranslations > 0 && removedTranslations > 0, "번역 줄 교체가 감지되지 않았습니다");
console.log(JSON.stringify({ base, files: files.length, addedTranslations, removedTranslations, originalChanges: 0, sourceHashChanges: 0 }));
console.log("translation patch verification passed");
