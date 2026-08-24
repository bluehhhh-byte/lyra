import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const publicPage = await readFile(new URL("../app/movies/page.js", import.meta.url), "utf8");
const adminPage = await readFile(new URL("../app/admin/cyno-carousel/page.js", import.meta.url), "utf8");
const adminMoviePage = await readFile(new URL("../app/admin/movie/page.js", import.meta.url), "utf8");
const adminHome = await readFile(new URL("../app/admin/page.js", import.meta.url), "utf8");
const studio = await readFile(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
const adminMoviesApi = await readFile(new URL("../app/api/admin/movies.js", import.meta.url), "utf8");
const middleware = await readFile(new URL("../middleware.js", import.meta.url), "utf8");

assert.doesNotMatch(publicPage, /MovieCarousel|캐러셀 만들기/, "공개 영화 목록에 제작 기능이 남으면 안 된다");
assert.match(adminMoviePage, /\/admin\/cyno-carousel/, "영화 관리자에서 제작실로 이동할 수 있어야 한다");
assert.match(adminHome, /aria-label="관리자 주요 메뉴"/, "관리자 첫 화면에 주요 메뉴가 있어야 한다");
assert.match(adminHome, /href="\/admin\/cyno-carousel"/, "관리자 첫 화면에서 제작실로 바로 가야 한다");
assert.match(adminHome, /영화 캐러셀 제작실/, "메뉴 이름만 보고 기능을 알아야 한다");
assert.match(adminPage, /getAllMoviesMeta\(\)/, "목록 화면은 본문 없는 경량 영화 메타만 받아야 한다");
assert.doesNotMatch(adminPage, /getAllMoviesRuntime\(\)/, "전체 영화 본문을 제작 화면에 직렬화하면 안 된다");
assert.match(middleware, /"\/admin\/:path\*"/, "제작실은 기존 관리자 인증 경계 안에 있어야 한다");

const rules = [
  [/const W = 1080/, "Instagram 원본 너비가 필요하다"],
  [/const H = 1350/, "Instagram 원본 높이가 필요하다"],
  [/const POSTER_CONCURRENCY = 5/, "포스터 동시 로딩을 제한해야 한다"],
  [/\/api\/img\?url=/, "TMDB 이미지는 동일 출처 프록시를 거쳐야 한다"],
  [/function posterFallback/, "포스터 실패 fallback이 필요하다"],
  [/한 편 깊이 보기/, "기본 한 편 모드가 보여야 한다"],
  [/주제별 큐레이션/, "별도 큐레이션 모드가 보여야 한다"],
  [/원문 자동 구성/, "선택만 하면 원문이 자동 구성되어야 한다"],
  [/문구를 새로 만들거나 원문을 수정하지 않습니다/, "원문 보존 안내가 필요하다"],
  [/grid min-w-0 gap-6/, "편집기 열은 모바일에서 축소 가능해야 한다"],
  [/w-auto max-w-full/, "큰 미리보기는 모바일 화면 폭 안에 맞아야 한다"],
  [/gridTemplateColumns: `repeat\(\$\{cards\.length\}/, "실제 장수만큼 탐색 열을 만들어야 한다"],
  [/error\?\.name === "AbortError"/, "공유 취소를 오류로 처리하면 안 된다"],
  [/aria-live="polite"/, "생성 상태를 보조기기에 알려야 한다"],
  [/adminApi\("movieCarouselDetail", \{ slug: selectedMeta\.slug \}\)/, "선택한 영화 상세 한 건만 관리자 API에서 받아야 한다"],
  [/carousel\.slides\.length/, "저장 버튼과 진행 표시는 실제 장수를 따라야 한다"],
  [/navigator\.canShare/, "모바일 공유 시트를 먼저 시도해야 한다"],
  [/String\(index \+ 1\)\.padStart\(2, "0"\)/, "다운로드 파일명에 순서가 보여야 한다"],
];
for (const [pattern, message] of rules) assert.match(studio, pattern, message);

assert.doesNotMatch(studio, /AI 문구|movieCarouselCopy|regenerateCopy|<Editor/, "단일 영화 제작에 AI나 수동 편집 단계를 두면 안 된다");
assert.match(adminMoviesApi, /action === "movieCarouselDetail"/, "상세 단건 조회 액션이 필요하다");
assert.match(adminMoviesApi, /getMovieRuntime/, "상세는 slug 단건 캐시에서 읽어야 한다");
assert.match(adminMoviesApi, /Response\.json\(\{ movie: carouselMovie\(movie\) \}\)/, "상세 원문을 가공 없이 브라우저 계약으로 변환해야 한다");
assert.doesNotMatch(adminMoviesApi, /movieCarouselCopyGen|buildSingleMovieDraft/, "캐러셀 API가 Gemini 생성 경로를 사용하면 안 된다");

console.log("Cyno admin-only carousel rendering contract passed");
