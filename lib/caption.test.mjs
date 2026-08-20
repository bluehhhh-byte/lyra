// Instagram caption format must match the agreed template exactly.
//   node --test lib/caption.test.mjs
import assert from "node:assert/strict";
import { buildCaption, buildMovieCaption, buildCarouselCaption } from "./caption.js";

// 2026-07-14 15:31 local (month is 0-based in the Date constructor)
const now = new Date(2026, 6, 14, 15, 31);

assert.equal(
  buildCaption({ artist: "SUEDE", title: "Trash", year: "1998" }, now),
  "| SUEDE - Trash (1998) #SUEDE #음악로그 #260714_1531"
);

// spaces + punctuation in the artist name collapse into one hashtag
assert.ok(
  buildCaption({ artist: "The Weeknd", title: "Cry For Me", year: "2025" }, now).includes("#TheWeeknd ")
);

// Korean artist, missing year → no "(…)" tail, Korean hashtag intact
assert.equal(
  buildCaption({ artist: "뉴진스", title: "Supernatural", year: "" }, now),
  "| 뉴진스 - Supernatural #뉴진스 #음악로그 #260714_1531"
);

assert.equal(
  buildMovieCaption({ director: "Michel Gondry", title: "이터널 선샤인", year: "2004" }, now),
  "| Michel Gondry - 이터널 선샤인 (2004) #MichelGondry #영화로그 #260714_1531"
);

assert.equal(
  buildMovieCaption({ director: "나홍진", title: "호프", year: "" }, now),
  "| 나홍진 - 호프 #나홍진 #영화로그 #260714_1531"
);

console.log("✓ caption format matches template");
console.log("all passed");

// 캐러셀 캡션 — 후크를 첫 줄에 반복하고 해시태그는 정확히 5개.
// 2025-12부터 인스타가 게시물당 5개로 제한했고, 그 이상은 넣을 수도 없다.
{
  const song = {
    artist: "최유리", title: "숲", year: "2022", emotion: "사랑",
    comment: "자신을 숲이라 했다가 바다가 아니었느냐고 되묻기를 반복한다.",
    tags: ["한국", "Indie Folk", "2022"],
  };
  const out = buildCarouselCaption(song, "나를 베어도 돼", new Date("2026-08-20T21:00:00"));

  assert.ok(out.startsWith('"나를 베어도 돼"'), "후크가 첫 줄 — 카드를 안 눌러도 피드에서 읽힌다");
  assert.ok(out.includes("최유리 — 숲 (2022)"));
  assert.ok(out.includes(song.comment), "해설이 캡션에도 들어간다");
  assert.ok(out.includes("프로필 링크"), "사이트 유입 경로");

  const tags = out.match(/#[^\s#]+/g).filter((t) => !/^#\d{6}_/.test(t)); // 타임스탬프 제외
  assert.equal(tags.length, 5, `해시태그는 정확히 5개 (실제 ${tags.length}: ${tags})`);
  assert.ok(tags.includes("#최유리") && tags.includes("#숲"), "아티스트·곡명은 반드시");
  assert.ok(tags.includes("#한국인디"), "국적 태그를 넓은 검색어로 옮긴다");

  // 후크가 없으면 첫 줄을 비워 두지 않는다
  const noHook = buildCarouselCaption(song, "", new Date("2026-08-20T21:00:00"));
  assert.ok(noHook.startsWith("최유리 —"), "후크가 없으면 곡 정보로 시작");
}

console.log("✓ 캐러셀 캡션");
