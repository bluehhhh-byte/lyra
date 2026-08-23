// title_ko가 번역인지 음역인지 훑어본다.
//
// 예전 생성 규칙이 "영어·고유명사는 한글 음역"이어서 뜻이 분명한 제목까지
// 소리대로 적혔다(Green→그린, Baby→베이비). 규칙은 고쳤지만 이미 저장된 값은
// 그대로다. 무엇이 얼마나 남았는지 먼저 보고 나서 다시 생성할지 정한다.
//
// 판정은 휴리스틱이다 — 로마자 제목의 발음을 한글로 옮겨 보고 저장된 값과
// 비슷하면 음역으로 본다. 확정이 아니라 사람이 볼 목록을 좁히는 용도다.
//
//   node scripts/audit-title-ko.mjs            # 요약 + 의심 목록
//   node scripts/audit-title-ko.mjs --all      # 전체 출력
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const showAll = process.argv.includes("--all");

const readFront = (raw) => {
  const s = raw.replace(/\r\n/g, "\n");
  const m = s.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : "";
};
const field = (front, key) => {
  const m = front.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};

// 영어 철자를 한글 소리로 대충 옮긴다. 정확한 음역기가 아니라 "소리가 비슷한가"만 본다.
const ROMAN_TO_HANGUL = [
  ["tion", "션"], ["sion", "션"], ["ough", "오"], ["ight", "아이트"],
  ["ch", "치"], ["sh", "시"], ["th", "스"], ["ph", "프"], ["ck", "크"],
  ["oo", "우"], ["ee", "이"], ["ea", "이"], ["ou", "아우"], ["ow", "오우"],
  ["ai", "에이"], ["ay", "에이"], ["oa", "오"], ["au", "오"],
  ["a", "아"], ["b", "브"], ["c", "크"], ["d", "드"], ["e", "에"], ["f", "프"],
  ["g", "그"], ["h", "흐"], ["i", "이"], ["j", "즈"], ["k", "크"], ["l", "르"],
  ["m", "므"], ["n", "느"], ["o", "오"], ["p", "프"], ["q", "크"], ["r", "르"],
  ["s", "스"], ["t", "트"], ["u", "우"], ["v", "브"], ["w", "우"], ["x", "크스"],
  ["y", "이"], ["z", "즈"],
];

function roughReading(text) {
  let s = String(text).toLowerCase().replace(/[^a-z]/g, "");
  let out = "";
  while (s) {
    const hit = ROMAN_TO_HANGUL.find(([r]) => s.startsWith(r));
    if (hit) {
      out += hit[1];
      s = s.slice(hit[0].length);
    } else s = s.slice(1);
  }
  return out;
}

// 한글 음절을 초성/중성으로 쪼개 자음 뼈대만 남긴다 — 모음 표기 차이를 무시하려는 것.
const LEAD = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const skeleton = (text) =>
  [...String(text)]
    .filter((ch) => ch >= "가" && ch <= "힣")
    .map((ch) => LEAD[Math.floor((ch.charCodeAt(0) - 0xac00) / 588)])
    .join("");

// 자음 뼈대가 얼마나 겹치는가 (0~1)
function similarity(a, b) {
  const x = skeleton(a);
  const y = skeleton(b);
  if (!x || !y) return 0;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  let hit = 0;
  let cursor = 0;
  for (const ch of short) {
    const at = long.indexOf(ch, cursor);
    if (at >= 0) {
      hit++;
      cursor = at + 1;
    }
  }
  // 짧은 쪽 기준으로 나눈다. 긴 쪽 기준이면 "Green→그린"처럼 음역이 원문보다
  // 짧아지는 흔한 경우(모음 축약)를 놓친다 — 실제로 처음엔 9곡만 걸렸다.
  return hit / short.length;
}

const rows = [];
for (const name of fs.readdirSync(path.join(root, "songs")).sort()) {
  if (!name.endsWith(".md")) continue;
  const front = readFront(fs.readFileSync(path.join(root, "songs", name), "utf8"));
  const title = field(front, "title");
  const titleKo = field(front, "title_ko");
  const lang = field(front, "lang");
  if (!title || !titleKo || title === titleKo) continue;
  // 한국어 곡은 제목이 이미 한글이라 대상이 아니다
  if (lang === "ko" && !/[A-Za-z]/.test(title)) continue;

  const latin = /[A-Za-z]/.test(title);
  const cjk = /[぀-ヿ㐀-鿿]/.test(title);
  if (!latin && !cjk) continue;

  const score = latin ? similarity(roughReading(title), titleKo) : 0;
  rows.push({ slug: name.slice(0, -3), title, titleKo, lang, latin, cjk, score });
}

const suspects = rows.filter((r) => r.latin && r.score >= 0.9).sort((a, b) => b.score - a.score);

console.log(`제목이 로마자/일본어이고 title_ko가 있는 곡: ${rows.length}`);
console.log(`  음역으로 의심되는 곡: ${suspects.length}`);
console.log("");
console.log("의심 목록 (자음 뼈대 일치율 순 — 사람이 확인할 것):");
for (const r of (showAll ? suspects : suspects.slice(0, 40))) {
  console.log(`  ${String(Math.round(r.score * 100)).padStart(3)}%  ${r.title.padEnd(34).slice(0, 34)} → ${r.titleKo}`);
}
if (!showAll && suspects.length > 40) console.log(`  … 외 ${suspects.length - 40}곡 (--all로 전체)`);
console.log("");
console.log("주의: 고유명사(인명·지명)와 정착 외래어는 음역이 맞다. 목록에서 걸러낼 것.");
