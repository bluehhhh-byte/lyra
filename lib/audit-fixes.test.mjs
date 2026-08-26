import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFrontmatter, parseLyrics } from "./songs.js";
import { isNonLyricLine } from "./admin/needs.js";
import { toHomeSong } from "./home-song-list.js";

const readSong = (name) =>
  parseFrontmatter(readFileSync(new URL(`../songs/${name}.md`, import.meta.url), "utf8").replace(/\r\n/g, "\n"));

{
  const { meta, body } = readSong("bigbang-biiig");
  assert.equal(meta.lang, "ko", "한국어 우세 혼합 가사는 ko로 분류한다");
  const echoes = parseLyrics(body)
    .flatMap((stanza) => stanza.lines)
    .filter((line) => /[가-힣]/.test(line.en || "") && line.en?.trim() === line.ko?.trim());
  assert.equal(echoes.length, 0, "한국어 원문을 번역 자리에 그대로 복사하지 않는다");
}

{
  const { meta, body } = readSong("지드래곤-power");
  assert.equal(meta.lyrics_none, "true");
  assert.ok(meta.lyrics_note, "가사 미수록 판단 근거를 남긴다");
  const lyricLines = parseLyrics(body)
    .flatMap((stanza) => stanza.lines)
    .filter((line) => line.en?.trim() && !isNonLyricLine(line.en));
  assert.equal(lyricLines.length, 0, "해설형 게시물을 가사로 세지 않는다");
}

{
  const item = toHomeSong({
    slug: "sample",
    title: "Sample",
    artist: "가수",
    year: "2024",
    tags: ["한국", "Indie Pop"],
    lang: "en",
    emotion: "기쁨",
  });
  assert.equal(item.country, "한국", "가사 언어보다 아티스트 국가 태그가 우선한다");
  assert.equal(item.decade, "2020s");
  assert.equal(item.recorded, "", "기록일이 없는 이전 곡 DTO도 빈 문자열로 정렬 가능하다");
  assert.deepEqual(Object.keys(item).sort(), [
    "album", "artist", "artist_ko", "artwork", "country", "decade", "emotion",
    "recorded", "slug", "tags", "title", "title_ko", "year",
  ]);
}

console.log("✓ 감사 수정 회귀 — 데이터 방향·가사 상태·홈 목록 DTO");
