import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [download, route, header] = await Promise.all([
  readFile(new URL("../app/logo-download.js", import.meta.url), "utf8"),
  readFile(new URL("../app/downloads/[asset]/route.js", import.meta.url), "utf8"),
  readFile(new URL("../app/header.js", import.meta.url), "utf8"),
]);

assert.match(download, /href=\{`\/downloads\/\$\{section\}-profile\.png`\}/);
assert.match(download, /download=\{filename\}/);
assert.match(download, /instagram-profile-1080\.png/);
assert.match(download, /PNG 1080×1080/);
assert.match(route, /new ImageResponse/);
assert.match(route, /const SIZE = 1080/);
assert.match(route, /Content-Disposition/);
assert.match(route, /image-profile-1080|instagram-profile-1080/);
assert.match(route, /background: "#12100e"/);
assert.match(route, /stroke="#eee7d2"/);
assert.match(route, /\[0, 1, 2, 3, 4, 5, 6\]/);
assert.match(header, /<LogoDownload section=\{inMovies \? "cyno" : "lyra"\}/);
assert.match(header, /className="flex min-h-11 items-center font-serif/);

console.log("✓ 헤더 심벌은 서버가 생성한 인스타그램용 1080×1080 PNG로 다운로드된다");
