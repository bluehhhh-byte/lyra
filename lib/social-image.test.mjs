import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const image = readFileSync(new URL("../public/opengraph-image.png", import.meta.url));
assert.equal(image.subarray(1, 4).toString(), "PNG");
assert.equal(image.readUInt32BE(16), 1200);
assert.equal(image.readUInt32BE(20), 630);

const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
assert.match(layout, /images: \[\{ url: "\/opengraph-image\.png", width: 1200, height: 630/);
assert.match(layout, /card: "summary_large_image"/);
assert.doesNotMatch(layout, /ImageResponse|opengraph-image\.js/, "공유 이미지를 런타임에 만들지 않는다");
