// 교차 번역 규칙은 두 프롬프트에 나뉘어 산다: 새 곡 번역(song-meta.js)과 빠진 번역
// 보충(songs.js). 한쪽만 고치면 곡이 어느 경로로 들어왔는지에 따라 번역 방식이 갈리고,
// 그 차이는 화면에서 바로 안 보인다. 규칙은 docs/TRANSLATION.md 에 적혀 있다.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), "utf8");

test("두 번역 프롬프트 모두 혼용 줄을 교차 번역하라고 지시한다", async () => {
  const [songMeta, songsApi] = await Promise.all([
    read("lib/admin/song-meta.js"),
    read("app/api/admin/songs.js"),
  ]);

  // 주 언어로 줄 전체를 옮기던 옛 규칙이 되살아나면 잡는다.
  assert.match(songMeta, /CROSS-TRANSLATE/);
  assert.doesNotMatch(songMeta, /judge by its dominant language and translate the WHOLE line/);
  assert.match(songsApi, /조각별로 교차/);
  assert.doesNotMatch(songsApi, /줄의 주 언어가 한국어/);

  // 사양을 정한 예시 — 양쪽 프롬프트가 같은 예시를 들고 있어야 결과가 갈리지 않는다.
  for (const [name, text] of [["song-meta", songMeta], ["songs-api", songsApi]]) {
    assert.ok(text.includes("커져가는 innocent"), `${name}: innocent 예시 누락`);
    assert.ok(text.includes("우리만에 시간"), `${name}: 우리만에 시간 예시 누락`);
  }
});

test("문서가 교차 번역 규칙과 두 프롬프트 위치를 적어 둔다", async () => {
  const doc = await read("docs/TRANSLATION.md");
  assert.match(doc, /조각별로 교차한다/);
  assert.match(doc, /lib\/admin\/song-meta\.js/);
  assert.match(doc, /app\/api\/admin\/songs\.js/);
});
