import assert from "node:assert/strict";
import fs from "node:fs";

const root = fs.readFileSync(new URL("../app/archive/page.js", import.meta.url), "utf8");
const period = fs.readFileSync(new URL("../app/archive/[day]/page.js", import.meta.url), "utf8");
const theme = fs.readFileSync(new URL("../app/archive/[day]/[theme]/page.js", import.meta.url), "utf8");
const legacy = fs.readFileSync(new URL("../app/archive/legacy-redirect.js", import.meta.url), "utf8");

assert.match(root, /export const revalidate = 21600;/, "기본 아카이브는 6시간 ISR이어야 한다");
assert.doesNotMatch(root, /function ArchivePage\(\{ searchParams \}\)/, "쿼리가 기본 화면을 동적 렌더링으로 바꾸면 안 된다");
assert.match(period, /generateStaticParams/, "월 경로를 미리 생성해야 한다");
assert.match(period, /archiveMonths\(all\)\.includes\(period\)/, "같은 경로에서 기존 일별 URL도 유지해야 한다");
assert.match(theme, /archiveThemeParams/, "월과 고정 테마 조합을 미리 생성해야 한다");
assert.match(legacy, /router\.replace\(archivePath\(month, theme\)\)/, "기존 쿼리 URL을 새 경로로 이어야 한다");

console.log("archive static boundary passed");
