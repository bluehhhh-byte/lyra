// semantic-wrap을 캐러셀 캔버스 줄바꿈에 쓸 값이 있는가 — A/B 측정.
//
//   node scripts/eval-semantic-wrap.mjs
//
// 결론과 채택 기준은 lib/vendor/semantic-wrap/EVALUATION.md에 있다. 이 스크립트는
// 그 문서의 숫자를 다시 만드는 용도다 — 원본이 갱신되거나 코퍼스가 늘면 다시 돌려
// 판단이 그대로인지 본다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wrap } from "../lib/carousel-wrap.js";
import { koTitleModel } from "../lib/vendor/semantic-wrap/ko.ts";
import { selectLineBreaks } from "../lib/vendor/semantic-wrap/index.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Pretendard 근사 폭(한글 1자 = 1). 캔버스가 없는 node에서 재지만 A/B가 같은 자를
// 쓰므로 "어느 쪽이 더 고른가"라는 상대 비교에는 충분하다.
function widthOf(s) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x1100 && c <= 0xd7af) w += 1;
    else if (c >= 0x3000 && c <= 0x9fff) w += 1;
    else if (ch === " ") w += 0.31;
    else w += 0.52;
  }
  return w;
}
const ctx = { measureText: (s) => ({ width: widthOf(s) }) };
const semantic = (text, maxWidth) =>
  selectLineBreaks({ text, model: koTitleModel, maxWidth, measureText: widthOf }).lines;

// 카드에서 실제로 보이는 건 오른쪽 끝이 얼마나 고른가다. 마지막 줄을 뺀 줄 폭의
// 표준편차와, 상자를 70%도 못 채운 줄 수를 센다.
function ragged(lines, maxWidth) {
  const body = lines.slice(0, -1).map(widthOf);
  if (!body.length) return null;
  const mean = body.reduce((a, b) => a + b, 0) / body.length;
  const sd = Math.sqrt(body.reduce((a, b) => a + (b - mean) ** 2, 0) / body.length);
  return { sd, short: body.filter((w) => w < maxWidth * 0.7).length, n: body.length };
}

const corpus = { trans: [], comment: [], title: [] };
for (const file of fs.readdirSync(path.join(ROOT, "songs")).filter((f) => f.endsWith(".md"))) {
  const raw = fs.readFileSync(path.join(ROOT, "songs", file), "utf8").replace(/\r\n/g, "\n");
  const [, front = "", body = ""] = raw.split(/^---$/m);
  const field = (name) => {
    const m = front.match(new RegExp(String.raw`^${name}:\s*(?:"([^"]*)"|'([^']*)'|(.*))$`, "m"));
    return m ? (m[1] || m[2] || m[3] || "").trim() : "";
  };
  const comment = field("comment");
  if (comment.length > 30) corpus.comment.push(comment);
  const title = field("title_ko") || field("title");
  if (/[가-힣]/.test(title) && title.includes(" ")) corpus.title.push(title);
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("> ")) continue;
    const text = t.slice(2).trim();
    if (/[가-힣]/.test(text) && text.length > 12) corpus.trans.push(text);
  }
}

// maxWidth는 한글 글자 수 기준. 카드의 상자 폭 ÷ 글자 크기다.
const CASES = [
  { name: "가사 번역 (3~5장)", pool: corpus.trans.slice(0, 4000), maxWidth: 30 },
  { name: "곡 해설 (2장)", pool: corpus.comment, maxWidth: 25 },
  { name: "표지 제목 (모델 본래 용도)", pool: corpus.title, maxWidth: 12.3, show: 10 },
];

for (const { name, pool, maxWidth, show = 0 } of CASES) {
  let multi = 0, differ = 0, lineDelta = 0;
  let aSd = 0, bSd = 0, aShort = 0, bShort = 0, spans = 0;
  const examples = [];
  for (const text of pool) {
    const a = wrap(ctx, text, maxWidth);
    if (a.length < 2) continue;
    multi++;
    const b = semantic(text, maxWidth);
    lineDelta += b.length - a.length;
    const ra = ragged(a, maxWidth);
    const rb = ragged(b, maxWidth);
    if (ra && rb) { aSd += ra.sd; bSd += rb.sd; aShort += ra.short; bShort += rb.short; spans += ra.n; }
    if (a.join("|") === b.join("|")) continue;
    differ++;
    if (examples.length < show) examples.push({ a, b });
  }
  console.log(`\n## ${name} — 표본 ${pool.length} · 두 줄 이상 ${multi}`);
  console.log(`  다르게 접힘 ${differ} (${((differ / multi) * 100).toFixed(1)}%) · 줄 수 증감 ${lineDelta}`);
  console.log(`  줄 폭 표준편차 — 현재 ${(aSd / multi).toFixed(2)} · semantic ${(bSd / multi).toFixed(2)}`);
  console.log(`  상자 70% 미만 줄 — 현재 ${aShort}/${spans} (${((aShort / spans) * 100).toFixed(1)}%)` +
    ` · semantic ${bShort}/${spans} (${((bShort / spans) * 100).toFixed(1)}%)`);
  for (const e of examples) console.log(`    A ${JSON.stringify(e.a)}\n    B ${JSON.stringify(e.b)}`);
}
