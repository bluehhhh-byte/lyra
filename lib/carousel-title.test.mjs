import assert from "node:assert/strict";
import {
  carouselArtistLine,
  carouselDisplayTitle,
  carouselTitleParts,
  layoutBilingualCarouselTitle,
  layoutCarouselTitle,
  TRANSLATED_TITLE_POINT_OFFSET,
  titleTokens,
} from "./carousel-title.js";

const measure = (text, size) => [...text].reduce((width, char) => {
  if (/\s/.test(char)) return width + size * 0.28;
  if (/[^\u0000-\u00ff]/.test(char)) return width + size;
  return width + size * 0.55;
}, 0);
const assertFits = (layout, width) => {
  assert.ok(layout.lines.length >= 1 && layout.lines.length <= 3);
  assert.ok(layout.lines.every((line) => measure(line, layout.fontSize) <= width + 0.001));
};

assert.deepEqual(titleTokens("Jumpupw!nya (feat. Tierra Whack)"), ["Jumpupw!nya", "(feat. Tierra Whack)"]);
assert.deepEqual(
  carouselTitleParts("Calvin Harris - Feels (feat. Pharrell Williams, Katy Perry & Big Sean)", "Calvin Harris"),
  { main: "Feels", qualifier: "(feat. Pharrell Williams, Katy Perry & Big Sean)" },
);
assert.equal(
  carouselDisplayTitle("Feels (feat. Pharrell Williams, Katy Perry & Big Sean)", "느낌", "Calvin Harris"),
  "Feels (느낌)",
);
assert.equal(
  carouselArtistLine("Calvin Harris", "(feat. Pharrell Williams, Katy Perry & Big Sean)"),
  "Calvin Harris (Feat. Pharrell Williams, Katy Perry & Big Sean)",
);

// 일본어·한자 아티스트명 뒤에 한글 독음을 붙인다 — 제목이 `원제 (번역)`인 것과 같다
assert.equal(carouselArtistLine("サンボマスター", "", "삼보마스터"), "サンボマスター (삼보마스터)");
assert.equal(
  carouselArtistLine("陰陽座", "(feat. 黒猫)", "온묘자"),
  "陰陽座 (온묘자) (Feat. 黒猫)",
  "독음과 피처링이 함께 있으면 독음이 이름 바로 뒤에 온다",
);
// 라틴 문자 아티스트는 artist_ko가 애초에 비어 있다 — 값이 없으면 그대로 둔다
assert.equal(carouselArtistLine("Radiohead", "", ""), "Radiohead");
assert.equal(carouselArtistLine("Radiohead", "", "Radiohead"), "Radiohead", "같은 값이면 두 번 적지 않는다");
assert.equal(carouselArtistLine("Aiko", "", "(아이코)"), "Aiko (아이코)", "괄호가 딸려 온 값도 한 겹만 씌운다");
// 아티스트 칸에 독음이 이미 박혀 있는 옛 곡들 — 두 번 적으면 안 된다
assert.equal(carouselArtistLine("鹿の一族(사슴의 일족)", "", "사슴의 일족"), "鹿の一族(사슴의 일족)");
assert.equal(carouselArtistLine("空氣公團(공기공단)", "", "공기공단"), "空氣公團(공기공단)");
assert.equal(
  carouselArtistLine("千と千尋の神隱し(센과 치히로의 행방불명) OST", "", "센과 치히로의 행방불명 OST"),
  "千と千尋の神隱し(센과 치히로의 행방불명) OST",
  "괄호 자리가 달라도 같은 이름이면 덧붙이지 않는다",
);

for (const title of [
  "Don't Sit Down 'Cause I've Moved Your Chair",
  "Jumpupw!nya (feat. Tierra Whack)",
  "오늘보다 더 기쁜 날은 남은 생에 많지 않을 것이다",
]) {
  const layout = layoutCarouselTitle(title, measure, 888);
  assertFits(layout, 888);
  assert.equal(layout.truncated, false, `실제 긴 제목을 생략하면 안 됨: ${title}`);
}

const qualifier = layoutCarouselTitle("A Deliberately Long Main Song Title (feat. Tierra Whack)", measure, 360);
assertFits(qualifier, 360);
assert.ok(qualifier.lines.includes("(feat. Tierra Whack)"), "피처링 괄호는 가능하면 통째로 다음 줄에 둬야 함");
assert.equal(qualifier.truncated, false);

const feels = carouselTitleParts("Feels (feat. Pharrell Williams, Katy Perry & Big Sean)", "Calvin Harris");
const feelsMain = layoutCarouselTitle(carouselDisplayTitle(feels.main, "느낌"), measure, 888, 2);
assert.deepEqual(feelsMain.lines, ["Feels (느낌)"]);

const ended = layoutBilingualCarouselTitle("The World Has Ended", "세계가 끝났어", measure, 888, 2);
assert.deepEqual(ended.lines, ["The World Has Ended (세계가 끝났어)"]);
assert.equal(ended.fontSize, 52, "원문 제목 크기는 유지해야 함");
assert.equal(TRANSLATED_TITLE_POINT_OFFSET, 10);

const extreme = layoutCarouselTitle("아주 긴 제목 ".repeat(30), measure, 300);
assertFits(extreme, 300);
assert.equal(extreme.fontSize, 32);
assert.equal(extreme.truncated, true);
assert.match(extreme.lines.at(-1), /…$/);

console.log("Carousel cover title layout passed");
