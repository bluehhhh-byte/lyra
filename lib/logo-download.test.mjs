import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [download, header] = await Promise.all([
  readFile(new URL("../app/logo-download.js", import.meta.url), "utf8"),
  readFile(new URL("../app/header.js", import.meta.url), "utf8"),
]);

assert.match(download, /const PROFILE_SIZE = 1080/);
assert.match(download, /canvas\.toBlob/);
assert.match(download, /instagram-profile-1080\.png/);
assert.match(download, /hand\.enso\(random, 50, 50, 34/);
assert.match(download, /hand\.spark\(random, 50, 50, 9/);
assert.match(download, /PALETTE\.VOID/);
assert.match(download, /PNG 1080×1080/);
assert.match(header, /<LogoDownload section=\{inMovies \? "cyno" : "lyra"\}/);
assert.match(header, /className="flex min-h-11 items-center font-serif/);

console.log("✓ 헤더 심벌은 인스타그램용 1080×1080 PNG로 다운로드된다");
