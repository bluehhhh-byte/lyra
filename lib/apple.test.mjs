// Apple Music 링크 — 곡마다 하나는 나와야 하고, 열리는 링크여야 한다.
//   node lib/apple.test.mjs
import assert from "node:assert/strict";
import { appleUrl, isExactApple } from "./apple.js";

// 저장된 링크는 검색한 스토어를 달고 온다(us·jp). 한국 계정으로 열면 그 스토어에서는
// 못 여는 페이지가 뜨므로 나라 코드만 우리 스토어로 바꾼다. 곡 id는 그대로 둔다.
{
  const u = appleUrl({ external_url: "https://music.apple.com/us/album/daydreaming/1111577743?i=1111577949&uo=4" });
  assert.equal(u, "https://music.apple.com/kr/album/daydreaming/1111577743?i=1111577949&uo=4");
  assert.ok(appleUrl({ external_url: "https://music.apple.com/jp/album/x/1?i=2" }).includes("/kr/"));
  assert.ok(appleUrl({ external_url: "https://music.apple.com/kr/album/x/1?i=2" }).includes("/kr/"));
}

// 링크가 없으면 trackId로, 그것도 없으면 검색으로 — 빈 손으로 돌려보내지 않는다
{
  assert.equal(appleUrl({ trackId: "123" }), "https://music.apple.com/kr/song/123");
  const s = appleUrl({ title: "Creep", artist: "Radiohead" });
  assert.ok(s.startsWith("https://music.apple.com/kr/search?term="));
  assert.ok(decodeURIComponent(s).includes("Creep Radiohead"));
}

// 정확한 곡을 가리키는지 — 화면 문구가 갈린다
{
  assert.ok(isExactApple({ external_url: "https://music.apple.com/us/album/x/1?i=2" }));
  assert.ok(isExactApple({ trackId: "123" }));
  assert.ok(!isExactApple({ title: "Creep", artist: "Radiohead" }));
}

console.log("all passed");
