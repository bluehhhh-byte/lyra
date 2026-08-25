// 영화 원제 백필 — title 필드를 TMDB 원제로 채운다.
//
// 데이터 모델의 의도는 title=원제, title_ko=한글 제목이다(eternal-sunshine이 그
// 모범). 그런데 50편 중 49편이 title에도 한글 제목이 복사돼 있어, 캐러셀 표지가
// 원제를 실을 수 없었다. tmdbId가 전 영화에 있으므로 TMDB에서 원제를 가져온다.
//
// title_ko·본문·source_hash는 건드리지 않는다. 원제가 한글 제목과 같으면(한국
// 영화) 그대로 둔다. 기본은 dry-run — --apply를 붙여야 파일에 쓴다.
//
//   node scripts/backfill-original-titles.mjs           # 대상 출력
//   node scripts/backfill-original-titles.mjs --apply   # 파일에 쓰고 나서 migrate 필요
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: false, quiet: true });

const key = String(process.env.TMDB_API_KEY || "").trim();
if (!key) throw new Error("TMDB_API_KEY가 없습니다.");
const apply = process.argv.includes("--apply");
const root = process.cwd();

const files = fs.readdirSync(path.join(root, "movies")).filter((name) => name.endsWith(".md")).sort();
const field = (front, name) => (front.match(new RegExp(`^${name}:\s*(.*)$`, "m")) || [])[1]?.trim() || "";

let changed = 0;
for (const name of files) {
  const file = path.join(root, "movies", name);
  const raw = fs.readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const text = raw.replace(/\r\n/g, "\n");
  const m = text.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!m) continue;
  const front = m[2];
  const title = field(front, "title");
  const titleKo = field(front, "title_ko");
  const tmdbId = field(front, "tmdbId");
  const media = field(front, "media") === "tv" ? "tv" : "movie";
  if (!tmdbId) continue;
  // 이미 원제가 들어가 있으면(한글 제목과 다르면) 존중한다 — 손으로 넣은 값이다
  if (title && titleKo && title !== titleKo) continue;

  const url = `https://api.themoviedb.org/3/${media}/${tmdbId}?api_key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    console.log(`  ! ${name}: TMDB ${res.status} — 건너뜀`);
    continue;
  }
  const data = await res.json();
  const original = String(media === "tv" ? data.original_name : data.original_title || "").trim();
  if (!original || original === title) continue;

  console.log(`  ${name.slice(0, -3)}: "${title}" → "${original}"`);
  changed++;
  if (apply) {
    const newFront = front.replace(/^title:.*$/m, `title: ${original}`);
    const newText = text.slice(0, m.index) + `---\n${newFront}\n---` + text.slice(m.index + m[0].length);
    fs.writeFileSync(file, eol === "\r\n" ? newText.replace(/\n/g, eol) : newText);
  }
  await new Promise((resolve) => setTimeout(resolve, 120)); // TMDB rate limit 여유
}

console.log(`\n대상 ${changed}편${apply ? " — 파일에 썼습니다. node scripts/migrate-content.mjs로 DB에 반영하세요." : " (dry-run — --apply로 실행)"}`);
