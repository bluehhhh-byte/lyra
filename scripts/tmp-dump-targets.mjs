// 번역이 빠진 줄과 그 앞뒤 맥락을 덤프한다 (번역 작업용).
//   node scripts/tmp-dump-targets.mjs <from> <count>
import { getAllSongs } from "../lib/songs.js";

const from = Number(process.argv[2] || 0), count = Number(process.argv[3] || 20);
const rows = [];
for (const s of getAllSongs()) {
  if (s.lang === "ko") continue;
  const L = s.stanzas.flatMap((st) => st.lines);
  const miss = L.filter((l) => l.en?.trim() && !l.ko?.trim() && !l.koMerged).length;
  if (miss) rows.push({ s, miss });
}
rows.sort((a, b) => b.miss - a.miss);

for (const { s, miss } of rows.slice(from, from + count)) {
  console.log(`\n##### ${s.slug} [${s.lang}] ${s.artist} - ${s.title} · 빠진 ${miss}줄`);
  for (const st of s.stanzas) {
    const lines = st.lines;
    if (!lines.some((l) => l.en?.trim() && !l.ko?.trim() && !l.koMerged)) continue;
    console.log(st.section ? `[${st.section}]` : "--");
    for (const l of lines) {
      const gap = l.en?.trim() && !l.ko?.trim() && !l.koMerged;
      console.log(`${gap ? "* " : "  "}${l.en}${l.ko ? `   ⟶ ${l.ko}` : l.koMerged ? "   (아래가 덮음)" : ""}`);
    }
  }
}
