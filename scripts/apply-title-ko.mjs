// title_ko를 매핑 파일대로 고친다.
//
// 예전 생성 규칙이 "영어·고유명사는 한글 음역"이어서 뜻이 분명한 제목까지
// 소리대로 적혔다(Green→그린). 규칙은 고쳤지만 저장된 값은 그대로라, 사람이
// 판단한 번역을 파일에 반영하는 도구다. Gemini를 부르지 않는다 — 쿼터를 쓰지 않고,
// 무엇이 바뀌는지 전부 눈으로 보고 넣기 위해서다.
//
// 프론트매터의 title_ko 한 줄만 바꾼다. 원문 가사·source_hash는 건드리지 않는다.
//
//   node scripts/apply-title-ko.mjs <매핑.json>            # dry-run (기본)
//   node scripts/apply-title-ko.mjs <매핑.json> --apply    # 파일에 쓴다
import fs from "node:fs";
import path from "node:path";

const mapPath = process.argv[2];
if (!mapPath) throw new Error("매핑 JSON 경로가 필요합니다.");
const apply = process.argv.includes("--apply");
const root = process.cwd();

const raw = JSON.parse(fs.readFileSync(mapPath, "utf8"));
// _로 시작하는 키는 주석이다
const mapping = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("_")));

const field = (front, key) => {
  const m = front.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};

const changed = [];
const same = [];
const missing = new Set(Object.keys(mapping));

for (const name of fs.readdirSync(path.join(root, "songs")).sort()) {
  if (!name.endsWith(".md")) continue;
  const file = path.join(root, "songs", name);
  const text = fs.readFileSync(file, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const norm = text.replace(/\r\n/g, "\n");
  const fm = norm.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;

  const title = field(fm[1], "title");
  if (!(title in mapping)) continue;
  missing.delete(title);

  const current = field(fm[1], "title_ko");
  const next = mapping[title];
  if (current === next) {
    same.push({ name, title, value: current });
    continue;
  }

  // title_ko 줄만 교체한다. 없으면 title 줄 바로 아래에 넣는다.
  let front = fm[1];
  if (/^title_ko:/m.test(front)) front = front.replace(/^title_ko:.*$/m, `title_ko: ${next}`);
  else front = front.replace(/^(title:.*)$/m, `$1\ntitle_ko: ${next}`);

  const updated = norm.slice(0, fm.index) + `---\n${front}\n---` + norm.slice(fm.index + fm[0].length);
  changed.push({ name, title, from: current, to: next, text: updated.replace(/\n/g, eol) , file });
}

for (const row of changed) {
  console.log(`  ${row.title.slice(0, 38).padEnd(38)} ${row.from.padEnd(22)} → ${row.to}`);
}

console.log("");
console.log(`바뀔 곡 ${changed.length} · 이미 같은 값 ${same.length} · 매핑에 있으나 곡이 없음 ${missing.size}`);
if (missing.size) console.log(`  못 찾은 제목: ${[...missing].join(", ")}`);

if (!apply) {
  console.log("\n(dry-run) 실제로 쓰려면 --apply를 붙이세요.");
} else {
  for (const row of changed) fs.writeFileSync(row.file, row.text);
  console.log(`\n${changed.length}개 파일을 고쳤습니다.`);
  console.log("DB 반영: node scripts/migrate-content.mjs");
}
