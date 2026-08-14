// 병합 번역 승격 — `>` 하나가 원문 여러 줄을 덮고 있던 곳을 `>^N`으로 표기한다.
//   node scripts/merge-translation-spans.mjs [--write] [--max=3]
//
// 인스타 캡션은 원문 두세 줄을 한 문장으로 번역해 붙인 곳이 많다. 파서는 `>`를
// 바로 위 한 줄에만 연결하므로, 그 위 줄들이 "번역 없음"으로 보였다(경고 84줄).
// 실제로는 아래 번역이 덮고 있으니 범위를 명시해 준다 — 번역 문자열은 그대로 두고
// 접두사만 `>` → `>^N`으로 바꾼다.
//
// 안전장치:
//  - en/ja 곡만 — 한국어 곡의 `>`는 영어 번역이고, 원문 중 영어 줄은 번역이
//    필요 없어 비어 있다. 그걸 "아래 번역이 덮는다"고 표기하면 거짓이 된다.
//  - 덮는 줄 수가 --max를 넘으면 손대지 않고 검토 목록으로 남긴다. 정말 번역이
//    빠진 것과 구분이 어려운 구간이라 자동 판단하지 않는다.
import fs from "fs";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const MAX = Number((args.find((a) => a.startsWith("--max=")) || "--max=3").split("=")[1]);

let changed = 0, files = 0, skipped = [];
for (const f of fs.readdirSync("songs").filter((x) => x.endsWith(".md"))) {
  const raw = fs.readFileSync("songs/" + f, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n[\s\S]*?\n---\n?/);
  if (!m) continue;
  const head = m[0];
  if (/^lang:\s*ko\s*$/m.test(head)) continue;
  const lines = raw.slice(head.length).split("\n");

  let hits = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^>(?!\^)/.test(lines[i])) continue; // 이미 `>^N`이면 건너뜀
    // 이 번역 바로 위에서 연속으로 이어지는 '번역 없는 원문' 줄 수를 센다
    let span = 0;
    for (let k = i - 1; k >= 0; k--) {
      const t = lines[k];
      if (!t.trim() || /^\[.*\]$/.test(t.trim())) break; // 문단·섹션 경계에서 멈춤
      if (/^[>+]/.test(t) || /^\/\//.test(t)) break;     // 이미 번역·독음이 붙은 줄
      span++;
      // 그 위 줄에 번역이 붙어 있으면 여기까지가 덮는 범위
      if (k > 0 && /^>/.test(lines[k - 1])) break;
    }
    if (span < 2) continue; // 1이면 평범한 1:1, 0이면 바로 위가 독음(`+`)인 경우
    // 이 번역 아래로 `>`가 더 이어지면 블록형이다 — 원문을 먼저 다 적고 번역을 아래에
    // 몰아 쓴 글. 위에 쌓인 원문은 이 줄 하나가 아니라 묶음 전체가 나눠 덮는다.
    // 여기서 첫 줄에 span을 매기면 뒤 번역들이 덮을 원문을 잃어 화면에서 사라진다.
    if (/^>/.test(lines[i + 1] || "")) continue;
    if (span > MAX) { skipped.push(`${f}: ${span}줄 (${lines[i].slice(0, 40)})`); continue; }
    lines[i] = lines[i].replace(/^>/, `>^${span}`);
    hits++;
  }
  if (!hits) continue;
  files++;
  changed += hits;
  if (WRITE) fs.writeFileSync("songs/" + f, head + lines.join("\n"));
  console.log(`  ${WRITE ? "" : "(dry) "}${f}: ${hits}곳`);
}
console.log(`\n${WRITE ? "승격" : "승격 예정"} ${changed}곳 / ${files}곡 · 검토 보류 ${skipped.length}`);
skipped.forEach((s) => console.log(`  보류: ${s}`));
