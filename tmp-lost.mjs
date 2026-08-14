// 파일에는 적혀 있는데 화면에는 안 나오는 번역을 찾는다.
// `>^N`이 실제 줄 수보다 많이 덮으면 파서가 앞선 번역을 통째로 버린다.
import fs from "fs";
import { getAllSongs, parseFrontmatter } from "./lib/songs.js";

const norm = (s) => String(s || "").replace(/[​-‍﻿]/g, "").replace(/ /g, " ").trim();
const songs = getAllSongs();
const rows = [];

for (const s of songs) {
  const raw = fs.readFileSync(`songs/${s.slug}.md`, "utf8").replace(/\r\n/g, "\n");
  const body = parseFrontmatter(raw).body;
  // 파일에 적힌 번역 줄 전부
  const written = body.split("\n").map((l) => l.trim())
    .filter((l) => /^>(\^\d+)?\s/.test(l))
    .map((l) => norm(l.replace(/^>(\^\d+)?\s/, "")))
    .filter(Boolean);
  // 화면에 붙은 번역
  const shown = s.stanzas.flatMap((st) => st.lines).map((l) => norm(l.ko)).filter(Boolean).join(String.fromCharCode(10));
  const lost = written.filter((t) => !shown.includes(t));
  if (lost.length) rows.push({ slug: s.slug, artist: s.artist, title: s.title, lost });
}

rows.sort((a, b) => b.lost.length - a.lost.length);
console.log(`번역이 화면에서 사라진 곡 ${rows.length}개 · 사라진 줄 ${rows.reduce((n, r) => n + r.lost.length, 0)}개\n`);
for (const r of rows) {
  console.log(`${r.slug}  (${r.lost.length}줄)  ${r.artist} — ${r.title}`);
  for (const l of r.lost.slice(0, 3)) console.log(`    ${l}`);
}
fs.writeFileSync(process.argv[2] || "lost.json", JSON.stringify(rows, null, 1));
