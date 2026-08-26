import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { IMAGE_PROXY_HOSTS, isAllowedImageProxyUrl } from "./image-hosts.js";

test("image proxy has one explicit host and path allowlist", () => {
  assert.deepEqual(IMAGE_PROXY_HOSTS, { "image.tmdb.org": ["/t/p/"] });
  assert.equal(isAllowedImageProxyUrl("https://image.tmdb.org/t/p/w780/poster.jpg"), true);
  assert.equal(isAllowedImageProxyUrl("http://image.tmdb.org/t/p/w780/poster.jpg"), false);
  assert.equal(isAllowedImageProxyUrl("https://image.tmdb.org/other/poster.jpg"), false);
  assert.equal(isAllowedImageProxyUrl("https://image.tmdb.org.evil.example/t/p/poster.jpg"), false);
  assert.equal(isAllowedImageProxyUrl("not a url"), false);
});

test("API route consumes the shared allowlist", () => {
  const source = fs.readFileSync(new URL("../app/api/img/route.js", import.meta.url), "utf8");
  assert.match(source, /import \{ isAllowedImageProxyUrl \}/);
  assert.match(source, /isAllowedImageProxyUrl\(url\)/);
  assert.doesNotMatch(source, /const ALLOWED|image\\?\.tmdb/);
});
