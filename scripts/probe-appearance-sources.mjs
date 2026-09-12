// 수록 정보 자동 검색을 Gemini 그라운딩 없이 할 수 있는가 — 후보 소스를 정답에
// 대고 잰다.
//
// 배경: 무료 티어에서 Google Search 그라운딩이 막혔고 기다려도 풀리지 않는다
// (CLAUDE.md '함정' 참조). 대체 소스를 고르되, 재현율을 모른 채 만들지 않는다.
//
// 정답은 data/song-appearances.json의 검증된 79건이다. 사람이 원문 근거까지 보고
// 확정한 것이라 자동 검색이 맞혀야 할 목표로 쓸 수 있다.
//
// 재는 것은 "후보 안에 정답이 들어 있는가"다. 후보에 없으면 뒤에 어떤 모델을
// 붙여도 못 맞힌다 — 상한선을 먼저 안다.
//
//   node scripts/probe-appearance-sources.mjs [--limit N]
import fs from "node:fs";
import path from "node:path";
import { findAppearanceCandidates, normalizeTitle } from "../lib/admin/appearance-search.js";

const LIMIT = process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : Infinity;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const songMeta = (slug) => {
  const file = path.join("songs", `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const get = (k) => (raw.match(new RegExp(`^${k}:\\s*(.*)$`, "m")) || [])[1]?.trim() || "";
  return { title: get("title"), artist: get("artist"), lang: get("lang") };
};

// 정답의 한글 작품명과 원제를 모두 인정한다. 한글 제목만 대조하면 영어 위키
// 문서를 읽고도 "못 맞혔다"가 된다 — 클로저/Closer가 그랬다.
const matches = (candidate, item) => {
  const got = normalizeTitle(candidate.work);
  if (got.length < 2) return false;
  return [item.workTitle, item.originalTitle]
    .filter(Boolean)
    .map(normalizeTitle)
    .filter((want) => want.length >= 2)
    .some((want) => got.includes(want) || want.includes(got));
};

const appearances = JSON.parse(fs.readFileSync("data/song-appearances.json", "utf8")).items || [];
const rows = appearances.slice(0, LIMIT);

let checked = 0;
let hit = 0;
let noCandidate = 0;
const byLang = {};
const bySource = { itunes: 0, wikipedia: 0 };
const misses = [];

for (const item of rows) {
  const meta = songMeta(item.songSlug);
  if (!meta?.title || !meta?.artist) continue;
  checked++;
  const lang = meta.lang || "?";
  byLang[lang] ||= { n: 0, hit: 0 };
  byLang[lang].n++;

  let candidates = [];
  try {
    candidates = await findAppearanceCandidates(meta);
  } catch {
    // 네트워크 딸꾹질은 소스의 잘못이 아니다
  }
  const right = candidates.find((c) => matches(c, item));
  if (right) {
    hit++;
    byLang[lang].hit++;
    bySource[right.source] = (bySource[right.source] || 0) + 1;
  } else {
    if (!candidates.length) noCandidate++;
    misses.push({ lang, ...meta, want: item.workTitle, got: candidates.map((c) => `${c.work}(${c.source})`).slice(0, 2) });
  }
  await sleep(1200); // 위키백과는 빠른 연속 호출을 막는다
}

console.log(`\n검증된 수록 정보 ${checked}건 — 후보 안에 정답이 있는가\n`);
console.log(`  맞힌 것:        ${hit} (${((hit / checked) * 100).toFixed(0)}%)`);
console.log(`  후보가 아예 없음: ${noCandidate}`);
console.log(`  맞힌 곳: iTunes ${bySource.itunes || 0} · 위키백과 ${bySource.wikipedia || 0}`);
console.log(`\n언어별:`);
for (const [lang, v] of Object.entries(byLang))
  console.log(`  ${lang}: ${v.hit}/${v.n} (${((v.hit / v.n) * 100).toFixed(0)}%)`);
console.log(`\n놓친 것 (앞 14건):`);
for (const m of misses.slice(0, 14))
  console.log(`  [${m.lang}] ${m.artist} — ${m.title}\n      정답: ${m.want}${m.got.length ? `\n      후보: ${m.got.join(" | ")}` : "   (후보 없음)"}`);
