// 번역 충실도 감사 — "가사 정확성 검토"를 어느 곡부터 할지 정한다.
//
// 사람이 원문과 대조하는 검토는 느려서 전 곡을 볼 수 없다. 곡마다 원문·번역 쌍을
// 최대 16개 고르게 뽑아 Jev(lib/admin/jev.js의 scoreTranslationFidelity)에 보이고
// 0~3점을 받아 낮은 곡부터 늘어놓는다. 판정이 아니라 순서다 — 점수가 낮다고
// 번역이 틀린 것은 아니고, 사람이 먼저 볼 곡일 뿐이다.
//
//   node scripts/audit-translation-fidelity.mjs [--write] [--limit=N]
//
// AI_GATEWAY_API_KEY가 필요하다. Jev는 동시 요청이 2개를 넘으면 429를 준다 —
// 한 곡씩 돌고, 실패하면 1.5·3·6·12초 쉬고 다시 묻는다. 2026-09-26 00:00 KST
// 이후에는 Jev 무료 기간이 끝나 스크립트가 바로 멈춘다.
import fs from "node:fs";
import { getAllSongs } from "../lib/songs.js";
import { isNoteLine, isNonLyricLine } from "../lib/admin/needs.js";
import { scoreTranslationFidelity, PROMO_END_UTC } from "../lib/admin/jev.js";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "--limit=100000").split("=")[1]);
const SAMPLE = 16;
const yes = (v) => v === true || v === "true";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 한국어로 옮긴 외국어 줄만 본다 — 한국 곡의 한국어 줄(영어 번역이 붙는 쪽)과
// 여러 줄을 한 번에 덮는 >^N 병합 번역은 줄 단위 대조가 안 되므로 뺀다.
function pairsOf(song) {
  const pairs = (song.stanzas || [])
    .flatMap((stanza) => stanza.lines || [])
    .filter((line) =>
      line.en && line.ko && !line.koMerged &&
      !isNoteLine(line.en) && !isNonLyricLine(line.en) &&
      /[A-Za-zぁ-んァ-ヶ一-龯]/.test(line.en) && /[가-힣]/.test(line.ko)
    )
    .map((line) => ({ original: String(line.en).trim(), translation: String(line.ko).trim() }));
  if (pairs.length <= SAMPLE) return pairs;
  const step = pairs.length / SAMPLE;
  return Array.from({ length: SAMPLE }, (_, i) => pairs[Math.floor(i * step)]);
}

if (Date.now() >= PROMO_END_UTC) {
  console.error("Jev 무료 기간(2026-09-26 00:00 KST)이 끝났습니다 — 이 감사는 더 돌지 않습니다.");
  process.exitCode = 1;
} else if (!process.env.AI_GATEWAY_API_KEY) {
  console.error("AI_GATEWAY_API_KEY가 없습니다 — .env.local에 설정하거나 환경변수로 넘기세요.");
  process.exitCode = 1;
} else {
  const targets = getAllSongs()
    .filter((song) => !yes(song.instrumental) && !yes(song.lyrics_none))
    .map((song) => ({ song, pairs: pairsOf(song) }))
    .filter(({ pairs }) => pairs.length >= 4)
    .slice(0, LIMIT);
  console.log(`${targets.length}곡 검사 시작...`);

  const results = [];
  let failed = 0;
  for (const [i, { song, pairs }] of targets.entries()) {
    let score = null;
    for (let attempt = 0; attempt < 4 && score === null; attempt++) {
      score = await scoreTranslationFidelity(pairs);
      if (score === null) await sleep(1500 * 2 ** attempt);
    }
    if (score === null) failed++;
    else results.push({ slug: song.slug, title: song.title, artist: song.artist, pairsSampled: pairs.length, score });
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${targets.length}...`);
  }

  results.sort((a, b) => a.score - b.score);
  console.log(`\n완료: ${results.length}곡 채점, 실패 ${failed}곡. 점수가 낮은 25곡:`);
  for (const r of results.slice(0, 25)) console.log(`  [${r.score.toFixed(2)}] ${r.artist} — ${r.title} (${r.slug})`);

  if (WRITE) {
    const out = { version: 1, generatedAt: new Date().toISOString(), scored: results.length, failed, results };
    fs.writeFileSync(new URL("../data/translation-fidelity-audit.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
    console.log("\ndata/translation-fidelity-audit.json 저장됨");
  }
}
