import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../app/movies/movie-carousel.js", import.meta.url), "utf8");
const page = await readFile(new URL("../app/movies/page.js", import.meta.url), "utf8");

function verify(source) {
  const rules = [
    [/const POSTER_CONCURRENCY = 5/, "포스터 동시 로딩은 4~6개로 제한해야 한다"],
    [/\/api\/img\?url=/, "TMDB 포스터는 동일 출처 프록시를 거쳐야 한다"],
    [/function posterFallback/, "포스터 실패 시 제목이 남는 대체 카드가 필요하다"],
    [/Promise\.all\(Array\.from\(\{ length: Math\.min\(POSTER_CONCURRENCY/, "제한된 작업자 큐로 포스터를 불러야 한다"],
    [/cyno-\$\{preset\.id\}-\$\{String\(index \+ 1\)\.padStart\(2, "0"\)\}\.png/, "저장 파일명에 주제와 순서가 보여야 한다"],
    [/h-\[calc\(100dvh-1rem\)\]/, "모바일 모달은 화면 높이를 넘으면 안 된다"],
    [/max-w-\[calc\(100vw-1rem\)\]/, "모바일 모달은 화면 너비를 넘으면 안 된다"],
    [/grid-cols-5/, "다섯 장을 직접 확인하는 썸네일 탐색이 필요하다"],
    [/event\.key === "Escape"/, "Escape 키로 모달을 닫을 수 있어야 한다"],
    [/error\?\.name === "AbortError"/, "공유 취소가 강제 다운로드로 이어지면 안 된다"],
    [/aria-live="polite"/, "생성 및 저장 결과를 보조기기에 알려야 한다"],
    [/@lyra\.syno/, "맺음 카드에는 인스타그램 계정 안내가 필요하다"],
  ];
  for (const [pattern, message] of rules) assert.match(source, pattern, message);
}

assert.throws(() => verify("const POSTER_CONCURRENCY = 27"), /동시 로딩|프록시|대체 카드/);
verify(component);
assert.match(page, /Promise\.all\(\[getAllMoviesMeta\(\), getWatchedRuntime\(\)\]\)/, "독립적인 서버 읽기는 병렬이어야 한다");
assert.match(page, /buildMovieCarouselCatalog\(watched, movieRecords\)/, "브라우저에는 전량이 아니라 조립된 프리셋만 보내야 한다");

console.log("Cyno carousel rendering contract passed");
