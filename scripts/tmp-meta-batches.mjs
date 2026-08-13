// 신규 임포트 곡(키워드 없는 곡) 목록을 에이전트 배치로 쪼갠다.
import fs from "fs";
const targets = [];
for (const f of fs.readdirSync("songs").filter((x) => x.endsWith(".md"))) {
  const raw = fs.readFileSync("songs/" + f, "utf8").replace(/\r\n/g, "\n");
  const fm = (raw.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
  if (!/^source:\s*instagram/m.test(fm)) continue;
  if (/^keywords:\s*\[.+\]/m.test(fm)) continue; // 이미 채움
  const v = (k) => ((fm.match(new RegExp(`^${k}:\\s*(.*)$`, "m")) || [])[1] || "").trim();
  targets.push({ slug: f.replace(/\.md$/, ""), title: v("title"), artist: v("artist"), lang: v("lang"), year: v("year") });
}
const N = Number(process.argv[2] || 12);
const per = Math.ceil(targets.length / N);
const batches = Array.from({ length: N }, (_, i) => targets.slice(i * per, (i + 1) * per));
fs.writeFileSync("../.meta-batches.json", JSON.stringify(batches, null, 1));
batches.forEach((b, i) => console.log(`batch ${i + 1}: ${b.length}곡`));
console.log("합계", targets.length);
