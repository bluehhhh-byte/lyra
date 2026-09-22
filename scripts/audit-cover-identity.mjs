// 앨범 정체성 감사 — title/artist/album 조합이 원곡 아티스트 자신의 정식
// 발매처럼 보이는지 Jev(lib/admin/jev.js의 checkAlbumIdentity)로 1차 필터링한다.
//
// 이미지 자체를 보는 게 아니라 텍스트 신호로 의심스러운 걸 추리는 것이라
// 완전한 커버 검증은 아니다 — scripts/audit-album-covers.mjs가 이미 "URL이
// 살아있고 이미지 응답을 주는가"를 감사하지만, "그 이미지가 실제로 이 곡의
// 커버가 맞는가"는 아무도 보지 않았다. 228곡을 사람이 다 볼 필요 없이,
// 의심스러운 것부터 보게 하는 1차 필터다.
//
//   node scripts/audit-cover-identity.mjs [--write] [--limit=N]
import fs from "node:fs";
import { getAllSongs } from "../lib/songs.js";
import { checkAlbumIdentity, ALBUM_SUSPECT_THRESHOLD } from "../lib/admin/jev.js";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "--limit=100000").split("=")[1]);

if (!process.env.AI_GATEWAY_API_KEY) {
  console.error("AI_GATEWAY_API_KEY가 없습니다 — .env.local에 설정하거나 환경변수로 넘기세요.");
  process.exitCode = 1;
} else {
  const songs = getAllSongs()
    .filter((s) => s.album && s.artwork)
    .slice(0, LIMIT);

  console.log(`${songs.length}곡 검사 시작...`);

  const results = [];
  let cursor = 0;
  let checked = 0;
  let skipped = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (cursor < songs.length) {
        const song = songs[cursor++];
        const p = await checkAlbumIdentity({ title: song.title, artist: song.artist, album: song.album });
        checked++;
        if (checked % 50 === 0) console.log(`  ${checked}/${songs.length}...`);
        if (p === null) {
          skipped++;
          continue; // Jev가 응답을 못 줌 — 프로모션 종료·키 없음·타임아웃 등
        }
        if (p < ALBUM_SUSPECT_THRESHOLD) {
          results.push({
            slug: song.slug,
            title: song.title,
            artist: song.artist,
            album: song.album,
            artwork: song.artwork,
            authenticProbability: p,
          });
        }
      }
    })
  );

  results.sort((a, b) => a.authenticProbability - b.authenticProbability);

  console.log(
    `\n검사 완료: ${songs.length}곡 중 ${results.length}곡이 의심스러움 ` +
      `(authentic < ${ALBUM_SUSPECT_THRESHOLD}, Jev 무응답 ${skipped}곡 제외)`
  );
  for (const r of results) {
    console.log(`  [${r.authenticProbability.toFixed(2)}] ${r.slug} — "${r.title}" / ${r.artist} / ${r.album}`);
  }

  if (WRITE) {
    const out = {
      version: 1,
      generatedAt: new Date().toISOString(),
      threshold: ALBUM_SUSPECT_THRESHOLD,
      totalChecked: songs.length,
      skipped,
      suspectCount: results.length,
      suspects: results,
    };
    fs.writeFileSync(new URL("../data/cover-identity-audit.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
    console.log("\ndata/cover-identity-audit.json 저장됨");
  }
}
