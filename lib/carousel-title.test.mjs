import assert from "node:assert/strict";
import {
  carouselArtistLine,
  carouselDisplayTitle,
  carouselTitleParts,
  layoutCarouselTitle,
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

const extreme = layoutCarouselTitle("아주 긴 제목 ".repeat(30), measure, 300);
assertFits(extreme, 300);
assert.equal(extreme.fontSize, 32);
assert.equal(extreme.truncated, true);
assert.match(extreme.lines.at(-1), /…$/);

console.log("Carousel cover title layout passed");
