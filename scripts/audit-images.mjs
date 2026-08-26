import fs from "node:fs";
import path from "node:path";

const expected = {
  "app/admin/backfill.js": 1,
  "app/admin/cyno-carousel/carousel-studio.js": 2,
  "app/admin/form.js": 1,
  "app/admin/movie-form.js": 2,
  "app/admin/movie-tools.js": 1,
  "app/admin/publish-queue/page.js": 1,
  "app/admin/publish-queue/publish-candidate-card.js": 1,
  "app/admin/song-tools.js": 1,
  "app/archive/[day]/page.js": 1,
  "app/cover-image.js": 1,
  "app/diary/diary-month.js": 1,
  "app/moments/[slug]/page.js": 1,
  "app/movies/[slug]/movie-card.js": 1,
  "app/movies/[slug]/page.js": 2,
  "app/player.js": 1,
  "app/recap/page.js": 2,
  "app/songs/[slug]/lyric-card.js": 2,
  "app/songs/[slug]/page.js": 3,
};

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
  });
}

const rows = walk("app").flatMap((file) => {
  const source = fs.readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
  const count = source.match(/<img(?=[\s/>])/g)?.length || 0;
  return count ? [[file.replaceAll("\\", "/"), count]] : [];
});
const actual = Object.fromEntries(rows.sort(([a], [b]) => a.localeCompare(b)));
const total = Object.values(actual).reduce((sum, count) => sum + count, 0);

console.log(`raw <img>: ${total}개 / ${rows.length}개 파일`);
for (const [file, count] of Object.entries(actual)) console.log(`${String(count).padStart(2)}  ${file}`);

const matchesAudit = Object.keys(actual).length === Object.keys(expected).length
  && Object.entries(expected).every(([file, count]) => actual[file] === count);
if (process.argv.includes("--check") && !matchesAudit) {
  console.error("감사 기준과 달라졌습니다. 새 사용처의 최적화 필요성을 판단하고 docs/IMG-AUDIT.md를 갱신하세요.");
  process.exitCode = 1;
}
