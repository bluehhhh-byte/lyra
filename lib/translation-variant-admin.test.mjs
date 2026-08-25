import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
const form = fs.readFileSync(new URL("../app/admin/edit/[slug]/edit-form.js", import.meta.url), "utf8");
const middleware = fs.readFileSync(new URL("../middleware.js", import.meta.url), "utf8");

assert.match(api, /translationVariants\(parseLyrics\(body\)\.flatMap/);
assert.match(api, /translationVariants: variantsFromRaw\(song\.raw\)/);
assert.match(api, /translationVariants: variantsFromRaw\(body\.raw\)/);
assert.match(form, /data-testid="translation-variant-notice"/);
assert.match(form, /if \(!items\.length\) return null;/, "흔들림 없는 곡에는 안내를 렌더하지 않는다");
assert.doesNotMatch(form, /통일|자동 수정/, "자동 통일 기능을 만들지 않는다");
assert.match(middleware, /"\/admin\/:path\*"/, "관리자 하위 화면은 인증 범위 안이어야 한다");
console.log("translation variant admin boundary passed");
