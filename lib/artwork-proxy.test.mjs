import assert from "node:assert/strict";
import fs from "node:fs";
import { carouselArtworkSrc, isTrustedArtworkUrl } from "./artwork-source.js";
import { GET } from "../app/api/artwork/route.js";

const apple = "https://is1-ssl.mzstatic.com/image/cover.jpg";
assert.equal(isTrustedArtworkUrl(apple), true);
assert.equal(isTrustedArtworkUrl("https://example.com/not-a-cover.jpg"), false);
assert.equal(isTrustedArtworkUrl("http://image.bugsm.co.kr/insecure.jpg"), false);
assert.equal(carouselArtworkSrc(apple), `/api/artwork?url=${encodeURIComponent(apple)}`);
assert.equal(carouselArtworkSrc("https://example.com/no.jpg"), "");

const rejected = await GET(new Request("https://lyracyno.vercel.app/api/artwork?url=https%3A%2F%2Fexample.com%2Fx.jpg"));
assert.equal(rejected.status, 400);

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
  status: 200,
  headers: { "Content-Type": "image/jpeg", "Content-Length": "3" },
});
try {
  const proxied = await GET(new Request(`https://lyracyno.vercel.app${carouselArtworkSrc(apple)}`));
  assert.equal(proxied.status, 200);
  assert.equal(proxied.headers.get("content-type"), "image/jpeg");
  assert.equal(proxied.headers.get("access-control-allow-origin"), "*");
  assert.equal((await proxied.arrayBuffer()).byteLength, 3);
} finally {
  globalThis.fetch = originalFetch;
}

const carousel = fs.readFileSync(new URL("../app/songs/[slug]/lyric-card.js", import.meta.url), "utf8");
assert.match(carousel, /loadImage\(carouselArtworkSrc\(song\.artwork\)\)/);
console.log("carousel artwork proxy contract passed");
