// 메타/본문 분리 계약.
//
// 목록 경로(getAllSongsMeta / getAllMoviesMeta)는 본문을 싣지 않는다. 그 계약을
// 모르고 목록에서 상세를 꺼내 쓰면 가사나 줄거리가 조용히 사라진다 — 화면은
// 멀쩡히 렌더되고 본문만 빈다. 실제로 이 분리를 넣던 중 한 번 그렇게 만들었다.
//
// 여기서는 DB 없이 파서 계약만 검증한다. 메타 경로가 받는 raw는 프론트매터까지
// 잘린 문자열이므로, 그 입력에서 나온 레코드가 어떤 모양인지 고정한다.
//   node lib/content-split.test.mjs
import assert from "node:assert/strict";
import { parseFrontmatter } from "./songs.js";

// lib/content-db.js의 SQL이 자르는 지점과 같은 규칙 — 두 번째 `---`까지.
const headOnly = (raw) => {
  const at = raw.replace(/\r\n/g, "\n").indexOf("\n---");
  return at < 0 ? raw : raw.slice(0, at + 4);
};

const SONG = `---
title: 숲
artist: 최유리
year: 2022
tags: [한국, Folk]
keywords: [마음, 숲]
emotion: 위로
comment: 자신을 숲이라 했다가 바다가 아니었느냐고 되묻는다.
---
난 저기 숲이 돼볼게
> I'll become that forest over there

너는 자그맣기만 한 언덕 위를
> You, on a hill that is only small
`;

const MOVIE = `---
title: 이터널 선샤인
director: Michel Gondry
year: 2004
rating: 4.5
themes: [기억, 사랑]
tags: [영미, 드라마]
---
기억을 지우는 시술을 받은 두 사람이 다시 만난다.

지워진 자리에서도 같은 선택을 반복한다.
`;

// 1) 잘라낸 raw에는 본문이 없다
{
  const head = headOnly(SONG);
  assert.ok(!head.includes("난 저기 숲이"), "메타 raw에 가사가 남으면 안 된다");
  assert.ok(head.includes("comment:"), "프론트매터 마지막 줄까지는 남아야 한다");
  assert.ok(head.trimEnd().endsWith("---"), "닫는 구분자까지 포함해야 파서가 읽는다");

  const movieHead = headOnly(MOVIE);
  assert.ok(!movieHead.includes("기억을 지우는"), "메타 raw에 줄거리가 남으면 안 된다");
}

// 2) 잘라낸 raw도 프론트매터는 온전히 파싱된다 — 목록 화면이 쓰는 필드가 전부 산다
{
  const { meta, body } = parseFrontmatter(headOnly(SONG));
  assert.equal(meta.title, "숲");
  assert.equal(meta.artist, "최유리");
  assert.equal(meta.year, "2022");
  assert.deepEqual(meta.tags, ["한국", "Folk"]);
  assert.deepEqual(meta.keywords, ["마음", "숲"]);
  assert.equal(meta.emotion, "위로");
  assert.ok(meta.comment.startsWith("자신을 숲이라"), "홈·카드가 쓰는 comment는 프론트매터에 있다");
  assert.equal(body.trim(), "", "메타 경로의 본문은 비어야 한다");
}

// 3) 전량 raw는 본문까지 살아 있다 — 상세 단건 조회가 쓰는 경로
{
  const { meta, body } = parseFrontmatter(SONG);
  assert.equal(meta.title, "숲");
  assert.ok(body.includes("난 저기 숲이 돼볼게"), "전량 경로는 가사를 잃지 않는다");
}

// 4) 프론트매터가 없는 입력에서도 자르기가 원문을 망가뜨리지 않는다
{
  const plain = "구분자가 없는 원문";
  assert.equal(headOnly(plain), plain);
}

// 5) 본문에 `---`가 또 나와도 첫 구분자에서 자른다 (수평선을 쓴 해설 등)
{
  const withRule = `---
title: 테스트
---
첫 줄

---

수평선 뒤의 문단
`;
  const head = headOnly(withRule);
  assert.ok(!head.includes("첫 줄"), "첫 구분자 이후는 전부 본문이다");
  const { meta } = parseFrontmatter(head);
  assert.equal(meta.title, "테스트");
}

console.log("✓ 메타/본문 분리 — 목록은 본문 없음, 상세 단건은 본문 유지");
