import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const publicPage = await readFile(new URL("../app/movies/page.js", import.meta.url), "utf8");
const adminPage = await readFile(new URL("../app/admin/cyno-carousel/page.js", import.meta.url), "utf8");
const adminMoviePage = await readFile(new URL("../app/admin/movie/page.js", import.meta.url), "utf8");
const studio = await readFile(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
const middleware = await readFile(new URL("../middleware.js", import.meta.url), "utf8");

assert.doesNotMatch(publicPage, /MovieCarousel|캐러셀 만들기/, "공개 영화 목록에 제작 기능이 남으면 안 된다");
assert.match(adminMoviePage, /\/admin\/cyno-carousel/, "영화 관리자에서 제작실로 이동할 수 있어야 한다");
assert.match(adminPage, /getAllMoviesRuntime\(\)/, "한 편 캐러셀은 상세 줄거리 레코드를 서버에서 받아야 한다");
assert.match(middleware, /"\/admin\/:path\*"/, "제작실은 기존 관리자 인증 경계 안에 있어야 한다");

const rules = [
  [/const W = 1080/, "Instagram 원본 너비가 필요하다"],
  [/const H = 1350/, "Instagram 원본 높이가 필요하다"],
  [/const POSTER_CONCURRENCY = 5/, "포스터 동시 로딩을 제한해야 한다"],
  [/\/api\/img\?url=/, "TMDB 이미지는 동일 출처 프록시를 거쳐야 한다"],
  [/function posterFallback/, "포스터 실패 fallback이 필요하다"],
  [/한 편 깊이 보기/, "기본 한 편 모드가 보여야 한다"],
  [/주제별 큐레이션/, "별도 큐레이션 모드가 보여야 한다"],
  [/기본 설명/, "기본 설명 편집 영역이 필요하다"],
  [/줄거리/, "줄거리 편집 영역이 필요하다"],
  [/주요 내용/, "주요 내용 편집 영역이 필요하다"],
  [/감상 포인트/, "감상 포인트 편집 영역이 필요하다"],
  [/grid min-w-0 gap-6/, "편집기 열은 모바일에서 축소 가능해야 한다"],
  [/w-auto max-w-full/, "큰 미리보기는 모바일 화면 폭 안에 맞아야 한다"],
  [/grid-cols-5/, "다섯 장 탐색이 필요하다"],
  [/error\?\.name === "AbortError"/, "공유 취소를 오류로 처리하면 안 된다"],
  [/aria-live="polite"/, "생성 상태를 보조기기에 알려야 한다"],
];
for (const [pattern, message] of rules) assert.match(studio, pattern, message);

console.log("Cyno admin-only carousel rendering contract passed");
