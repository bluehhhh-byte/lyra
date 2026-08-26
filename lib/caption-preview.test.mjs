import assert from "node:assert/strict";
import fs from "node:fs";
import { captionPreview, INSTAGRAM_CAPTION_LIMIT } from "./caption.js";

const multiline = captionPreview("첫 줄\r\n\r\n둘째 줄 😀");
assert.equal(multiline.text, "첫 줄\n\n둘째 줄 😀", "Instagram에 붙여넣을 LF 줄바꿈을 그대로 보존해야 한다");
assert.equal(multiline.lines, 3);
assert.equal(multiline.characters, 11, "이모지는 UTF-16 두 칸이 아니라 사용자 문자 한 자로 세야 한다");
assert.deepEqual(multiline.warnings, []);

const original = `${"가".repeat(INSTAGRAM_CAPTION_LIMIT)}초과`;
const over = captionPreview(original);
assert.equal(over.text, original, "길이 초과 캡션을 잘라내면 안 된다");
assert.match(over.warnings[0], /2자 초과/);

const tags = captionPreview(Array.from({ length: 31 }, (_, index) => `#태그${index}`).join(" "));
assert.equal(tags.hashtags, 31);
assert.match(tags.warnings[0], /1개 초과/);

const component = fs.readFileSync(new URL("../app/caption-preview.js", import.meta.url), "utf8");
assert.match(component, /whitespace-pre-wrap/);
assert.match(component, /role="alert"/);
for (const file of ["../app/songs/[slug]/lyric-card.js", "../app/movies/[slug]/movie-card.js", "../app/admin/cyno-carousel/carousel-studio.js"])
  assert.match(fs.readFileSync(new URL(file, import.meta.url), "utf8"), /InstagramCaptionPreview/);

console.log("캡션 미리보기 검증 통과");
