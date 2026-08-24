import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/songs/[slug]/lyric-card.js", import.meta.url), "utf8");

function validateCarouselDesign(code) {
  const rules = [
    [/document\.fonts\.ready/, "캔버스 렌더 전에 웹폰트를 기다려야 합니다"],
    [/"Pretendard Variable"/, "캔버스가 실제 로드된 Pretendard Variable을 사용해야 합니다"],
    [/drawImageCover\(ctx, art, 0, 0, W, artHeight\)/, "곡 설명 카드에 선명한 대형 앨범 아트가 필요합니다"],
    [/drawRoundedArt\(ctx, art, PAD, 68, 124\)/, "가사 카드에 선명한 앨범 썸네일이 필요합니다"],
    [/rgba\(247,247,248,0\.84\)/, "번역문 대비는 82% 이상이어야 합니다"],
    [/max-w-5xl/, "편집기는 큰 활성 미리보기를 제공해야 합니다"],
    [/h-\[calc\(100dvh-1rem\)\]/, "모바일 편집기는 동적 화면 높이 안에 들어와야 합니다"],
    [/max-w-\[calc\(100vw-1rem\)\]/, "모바일 편집기는 화면 너비를 넘으면 안 됩니다"],
    [/flex-1 gap-4 overflow-y-auto/, "화면보다 긴 내용은 모달 내부에서 스크롤되어야 합니다"],
    [/max-h-\[42dvh\]/, "모바일 미리보기는 화면 높이를 과도하게 차지하면 안 됩니다"],
    [/grid-cols-5/, "다섯 장을 직접 선택하는 썸네일 탐색이 필요합니다"],
    [/next\.size < MAX_SELECTED_LINES/, "선택 가사를 설정된 최대 줄 수로 제한해야 합니다"],
    [/최대 15줄/, "편집기에 15줄 선택 한도를 안내해야 합니다"],
    [/carouselDisplayTitle\(song\.title, song\.title_ko/, "원문 제목 옆에 한글 번역 제목을 붙여야 합니다"],
    [/carouselArtistLine\(song\.artist, titleParts\.qualifier\)/, "피처링 정보는 아티스트명 옆으로 옮겨야 합니다"],
    [/layoutCarouselTitle\(/, "긴 표지 제목은 줄 수와 글자 크기를 탄력적으로 조절해야 합니다"],
    [/titleLayout\.lines\.forEach/, "계산된 표지 제목을 여러 줄로 그려야 합니다"],
    [/const artistSize = fitFontSize\(/, "긴 피처링이 붙은 아티스트 정보는 자동 축소해야 합니다"],
    [/const translatedSize = Math\.max\(10, baseSize - \(4 \* 96\) \/ 72\)/, "원문 제목은 유지하고 괄호 속 한글 번역 제목만 4pt 작아야 합니다"],
    [/drawBilingualTitleLine\(ctx, \{/, "커버와 곡 설명은 이중 크기 제목 렌더러를 사용해야 합니다"],
  ];
  for (const [pattern, message] of rules) assert.match(code, pattern, message);

  const cover = code.slice(code.indexOf("async function drawCoverCard"), code.indexOf("async function drawAboutCard"));
  const about = code.slice(code.indexOf("async function drawAboutCard"), code.indexOf("async function downloadAll"));
  assert.match(cover, /carouselDisplayTitle\(song\.title, song\.title_ko/, "커버 제목에는 한글 번역을 괄호로 붙여야 합니다");
  assert.match(about, /carouselDisplayTitle\(song\.title, song\.title_ko/, "곡 설명 제목에도 한글 번역을 괄호로 붙여야 합니다");
  assert.match(about, /fitFontSize\(/, "곡 설명의 긴 원문 제목은 글자 크기를 맞춰 보존해야 합니다");
}

assert.throws(
  () => validateCarouselDesign('const SANS = "system-ui";'),
  /웹폰트|Pretendard|앨범|번역문|미리보기|썸네일|15줄|피처링/,
  "낡은 디자인을 닮은 부정 샘플은 계약을 통과하면 안 됩니다",
);
validateCarouselDesign(source);

console.log("✓ 캐러셀 디자인 — 아트·서체·가독성·편집기 계약 (부정 대조군 포함)");
