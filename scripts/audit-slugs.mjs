// URL을 바꾸지 않는 읽기 전용 감사. 현재 파일명과 신규 등록 규칙을 비교해
// 교차 충돌 및 역사적 slug 불일치를 보고할 뿐 이름을 바꾸지 않는다.
import { getAllSongs } from "../lib/songs.js";
import { getAllMovies } from "../lib/movies.js";
import { auditSlugs } from "../lib/slug-integrity.js";

const report = auditSlugs(getAllSongs(), getAllMovies());
console.log(`곡/영화 slug 교차 충돌 ${report.crossCollisions.length}건`);
for (const slug of report.crossCollisions) console.log(`  충돌: ${slug}`);
console.log(`현재 생성 규칙과 다른 기존 URL ${report.regenerated.length}건`);
for (const item of report.regenerated) console.log(`  ${item.kind}: ${item.slug} → ${item.expected}`);

// 충돌은 새 URL을 만들기 전에 해결해야 하므로 감사 실패다. 재생성 차이는 기존 URL을
// 보존해야 하는 역사적 기록이므로 보고만 하고 성공한다.
if (report.crossCollisions.length) process.exitCode = 1;
