import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const publicPage = await readFile(new URL("../app/movies/page.js", import.meta.url), "utf8");
const adminPage = await readFile(new URL("../app/admin/cyno-carousel/page.js", import.meta.url), "utf8");
const adminMoviePage = await readFile(new URL("../app/admin/movie/page.js", import.meta.url), "utf8");
const adminMomentsPage = await readFile(new URL("../app/admin/moments/page.js", import.meta.url), "utf8");
const adminHome = await readFile(new URL("../app/admin/page.js", import.meta.url), "utf8");
const header = await readFile(new URL("../app/header.js", import.meta.url), "utf8");
const studio = await readFile(new URL("../app/admin/cyno-carousel/carousel-studio.js", import.meta.url), "utf8");
const adminMoviesApi = await readFile(new URL("../app/api/admin/movies.js", import.meta.url), "utf8");
const middleware = await readFile(new URL("../middleware.js", import.meta.url), "utf8");

assert.doesNotMatch(publicPage, /MovieCarousel|캐러셀 만들기/, "공개 영화 목록에 제작 기능이 남으면 안 된다");
assert.match(adminMoviePage, /aria-label="Cyno 관리자 메뉴"/, "영화 관리가 Cyno 관리자 허브여야 한다");
assert.match(adminMoviePage, /href="\/admin\/movie"/, "Cyno 허브에 영화 관리가 있어야 한다");
assert.match(adminMoviePage, /href="\/admin\/cyno-carousel"/, "Cyno 허브에 캐러셀 제작실이 있어야 한다");
assert.match(adminMoviePage, /href="\/admin\/moments"/, "Cyno 허브에 장면 관리가 있어야 한다");
assert.doesNotMatch(adminHome, /href="\/admin\/(?:movie|cyno-carousel|moments)"/, "Lyra 곡 관리자에 Cyno 도구가 남으면 안 된다");
assert.match(adminMomentsPage, /href="\/admin\/movie"/, "장면 관리에서 Cyno 허브로 돌아갈 수 있어야 한다");
assert.doesNotMatch(adminMomentsPage, /href="\/admin"/, "장면 관리가 Lyra 곡 관리로 직접 연결되면 안 된다");
assert.match(header, /pathname\?\.startsWith\("\/admin\/cyno-carousel"\)/, "캐러셀 제작실은 Cyno 헤더 문맥이어야 한다");
assert.match(header, /pathname\?\.startsWith\("\/admin\/moments"\)/, "장면 관리는 Cyno 헤더 문맥이어야 한다");
assert.match(header, /href=\{inMovies \? "\/admin\/movie" : "\/admin"\}/, "Cyno에서 관리자 버튼은 영화 관리로 가야 한다");
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
  [/작품 개요/, "작품 개요 편집 영역이 필요하다"],
  [/줄거리 요약/, "줄거리 요약 편집 영역이 필요하다"],
  [/핵심 내용/, "핵심 내용 편집 영역이 필요하다"],
  [/감상 포인트/, "감상 포인트 편집 영역이 필요하다"],
  [/grid min-w-0 gap-6/, "편집기 열은 모바일에서 축소 가능해야 한다"],
  [/w-auto max-w-full/, "큰 미리보기는 모바일 화면 폭 안에 맞아야 한다"],
  [/grid-cols-5/, "다섯 장 탐색이 필요하다"],
  [/error\?\.name === "AbortError"/, "공유 취소를 오류로 처리하면 안 된다"],
  [/aria-live="polite"/, "생성 상태를 보조기기에 알려야 한다"],
  [/adminApi\("movieCarouselCopy", \{ slug: selectedMovie\.slug \}\)/, "선택한 영화의 고도화 문구를 관리자 API에서 받아야 한다"],
  [/AI 문구 다시 생성/, "명시적인 재생성 제어가 필요하다"],
  [/현재 편집 문구를 유지합니다/, "재생성 실패가 사용자 수정을 덮어쓰면 안 된다"],
  [/ctx\.font = `800 64px \$\{SANS\}`/, "이야기의 중심과 감상 포인트 제목은 크게 보여야 한다"],
  [/roundRect\(PAD, y - 62, W - PAD \* 2, 225, 24\)/, "큰 본문을 담을 수 있도록 항목 카드 높이를 확보해야 한다"],
  [/160, 45, 32\)/, "핵심 내용과 감상 포인트 본문은 최소 32px 이상이어야 한다"],
];
for (const [pattern, message] of rules) assert.match(studio, pattern, message);

assert.match(adminMoviesApi, /action === "movieCarouselCopy"/, "고도화 문구 액션이 필요하다");
assert.match(adminMoviesApi, /movieCarouselCopyGen/, "관리자 API가 검증된 생성기를 써야 한다");
assert.match(adminMoviesApi, /buildSingleMovieDraft/, "AI 실패 시 로컬 초안을 반환해야 한다");

console.log("Cyno admin navigation contract passed");
