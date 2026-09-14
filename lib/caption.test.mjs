// 인스타그램 캡션 — 크레딧 한 줄, 해시태그, 시각.
//
// 한동안 훅·해설·권유 문구까지 실었다. 카드가 이미 그 내용을 담고 있어 같은
// 말이 두 번 나갔고, 게시물이 설명문이 됐다. 크레딧만 남긴다 — 이미지 없이
// 캡션만 읽어도 무슨 곡인지는 알아야 한다.
//   node --test lib/caption.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  HASHTAG_MAX,
  appearanceLine,
  buildCaption,
  buildMovieCaption,
  buildMovieCarouselCaption,
  captionPreview,
  creditLine,
  instagramTag,
  suggestHashtags,
} from "./caption.js";

const now = new Date(2026, 8, 12, 21, 40);
const tagsOf = (caption) => (caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1));

const korean = { artist: "신해경", title: "그대는 총천연색", year: "2018", lang: "ko", genre: "Indie Pop", emotion: "고독", keywords: ["밤", "새벽"], listen_when: "어두운 밤 혼자", comment: "긴 해설이 여기 있다." };
const english = { artist: "SUEDE", title: "Trash", year: "1998", lang: "en", genre: "Rock", emotion: "저항", keywords: ["거리"] };
const japanese = { artist: "10-FEET", title: "第ゼロ感", year: "2022", lang: "ja", genre: "J-Rock", emotion: "희망", keywords: ["꿈"] };

test("a caption is a credit line, hashtags, then the time", () => {
  const lines = buildCaption(korean, now).split("\n");
  assert.deepEqual(lines, [
    "| 신해경 - 그대는 총천연색 (2018)",
    "#신해경 #그대는총천연색",
    "#가사추천 #오늘의노래 #플레이리스트",
    "(260912 21:40)",
  ]);

  // 카드가 담는 것을 캡션이 되풀이하지 않는다 — 크레딧 한 줄이 예외다
  const caption = buildCaption(korean, now);
  for (const echoed of [korean.listen_when, korean.comment])
    assert.ok(!caption.includes(echoed), `캡션이 ${JSON.stringify(echoed)}를 되풀이한다`);
});

test("a song that plays in a film says so, on its own line", () => {
  // 이 사실은 카드에도 있지만, 인스타그램이 색인하는 것은 캡션뿐이다.
  const appearance = { director_ko: "크리스토페르 보르글리", workTitle: "더 드라마", year: "2026", workType: "movie", role: "ending" };
  assert.deepEqual(
    buildCaption({ artist: "Moondog", title: "Do Your Thing", year: "1979", captionAppearance: appearance }, new Date(2026, 8, 13, 11, 43)).split("\n"),
    [
      "| Moondog - Do Your Thing (1979)",
      "& 크리스토페르 보르글리, 영화 <더 드라마> 엔딩 (2026) |",
      "#Moondog #DoYourThing",
      "#가사추천 #오늘의노래 #플레이리스트",
      "(260913 11:43)",
    ],
  );
  // 감독을 모르면 감독 없이 시작한다 — 빈 이름 자리를 남기지 않는다
  assert.equal(appearanceLine({ ...appearance, director_ko: "" }), "& 영화 <더 드라마> 엔딩 (2026) |");
  // 원문 감독은 한글 표기가 없을 때만 쓴다
  assert.equal(
    appearanceLine({ ...appearance, director_ko: "", director: "Kristoffer Borgli" }),
    "& Kristoffer Borgli, 영화 <더 드라마> 엔딩 (2026) |",
  );
  // 작품명이 없으면 줄 자체가 없다
  for (const empty of [null, undefined, {}, { workTitle: "  " }]) assert.equal(appearanceLine(empty), "");
});

test("the appearance labels come from the one file the song page uses", () => {
  // 캡션이 라벨을 따로 들고 있으면 화면과 캡션이 갈린다 — 그래서
  // lib/appearance-labels.js가 아무것도 import하지 않는다(클라이언트 번들).
  assert.match(
    appearanceLine({ workTitle: "장송의 프리렌", year: "2023", workType: "anime_series", role: "opening" }),
    /^& TV 애니메이션 <장송의 프리렌> 오프닝 \(2023\) \|$/,
  );
  // 모르는 유형·역할은 기본값으로 떨어진다 — 빈칸을 내보내지 않는다
  assert.equal(appearanceLine({ workTitle: "X", workType: "없음", role: "없음" }), "& 영화 <X> 기타 |");
});

test("the song's own tags and the fixed ones are on separate lines", () => {
  // 한 줄로 뭉치면 어디까지가 이 곡 얘기인지 눈으로 갈리지 않는다
  const [, specific, fixed] = buildCaption(korean, now).split("\n");
  assert.equal(specific, "#신해경 #그대는총천연색");
  assert.equal(fixed, "#가사추천 #오늘의노래 #플레이리스트");
});

test("a year is not put in a second pair of parentheses", () => {
  // "… (Pink Floyd Cover) (2004)"는 괄호가 두 번 나와 읽기 나쁘다
  assert.equal(
    creditLine("Korn", "Another Brick in the Wall (Pink Floyd Cover)", "2004"),
    "Korn - Another Brick in the Wall (Pink Floyd Cover) · 2004",
  );
  assert.equal(creditLine("10cm", "스토커", "2021"), "10cm - 스토커 (2021)");
  assert.equal(creditLine("10cm", "스토커", ""), "10cm - 스토커", "연도가 없으면 빈 괄호를 만들지 않는다");
});

test("the timestamp stays out of the hashtag budget", () => {
  // 예전에는 #260714_1531처럼 태그였다. 아무도 검색하지 않는 그것이 30개 중
  // 한 자리를 먹었다.
  const caption = buildCaption(korean, now);
  assert.ok(!/#\d{6}/.test(caption), "시각이 태그로 들어가면 안 된다");
  assert.match(caption, /\(260912 21:40\)$/, "본문 괄호로 끝난다");
});

test("a song post carries five tags: the artist, the title, and the fixed three", () => {
  // 한때 언어·장르·감정·키워드까지 스무 개 남짓을 달았다. 게시물 아래가
  // 태그 벽이 됐다. 다섯 개가 한도다.
  assert.equal(HASHTAG_MAX, 5);
  assert.deepEqual(tagsOf(buildCaption(korean, now)), [
    "신해경", "그대는총천연색", "가사추천", "오늘의노래", "플레이리스트",
  ]);
});

test("emotion and keywords no longer buy a tag slot", () => {
  // 곡마다 달라지는 태그는 검색되지 않고 자리만 먹었다 — #고독, #밤이 그랬다
  const tags = tagsOf(buildCaption(korean, now));
  for (const dropped of [korean.emotion, ...korean.keywords, korean.genre])
    assert.ok(!tags.includes(dropped), `#${dropped}이 남아 있다`);
});

test("a person's pick outranks the fixed three", () => {
  // 세트를 고르는 수고를 했다면 그게 이 게시물의 뜻이다. 고정 셋은 기본값이다.
  const tags = suggestHashtags(korean, { extra: ["직접고른태그"] });
  assert.deepEqual(tags.slice(0, 3), ["신해경", "그대는총천연색", "직접고른태그"]);
  assert.equal(tags.length, HASHTAG_MAX);
});

test("a title nobody would search leaves the slot empty instead of filling it", () => {
  // `#第ゼロ感`은 한국어 계정에서 아무도 검색하지 않는다. 빈자리를 아무 태그로
  // 메우면 게시물마다 태그가 달라져 다섯 개로 줄인 뜻이 사라진다.
  const tags = tagsOf(buildCaption(japanese, now));
  assert.deepEqual(tags, ["10FEET", "가사추천", "오늘의노래", "플레이리스트"]);
  // 한국어 제목과 라틴 문자 제목은 그대로 쓸모가 있다
  assert.ok(buildCaption(korean, now).includes("#그대는총천연색"));
  assert.ok(buildCaption(english, now).includes("#Trash"));
});

test("three languages each stay inside Instagram's limits", () => {
  for (const song of [korean, english, japanese]) {
    const preview = captionPreview(buildCaption(song, now));
    assert.deepEqual(preview.warnings, [], `${song.artist}: ${preview.warnings.join(", ")}`);
    assert.ok(preview.hashtags <= HASHTAG_MAX, `${song.artist}: 태그 ${preview.hashtags}개`);
  }
});

test("a tag keeps the whole name instead of breaking at a space", () => {
  // Instagram은 공백·문장부호에서 태그를 끊는다 — 붙여야 이름이 한 태그로 남는다
  assert.equal(instagramTag("노래 추천"), "노래추천");
  assert.equal(instagramTag("R&B/Soul"), "RBSoul");
  assert.equal(instagramTag(""), "");
});

test("duplicates never take two slots", () => {
  // 아티스트를 사람이 또 고르면 같은 태그가 두 자리를 먹는다
  const tags = tagsOf(buildCaption(korean, now, ["신해경", "가사추천"]));
  assert.equal(new Set(tags).size, tags.length);
});

test("movie captions follow the same shape", () => {
  const caption = buildMovieCaption(
    { director: "미셸 공드리", title: "이터널 선샤인", year: "2004", genre: "Romance", emotion: "사랑", themes: ["기억"] },
    now,
  );
  assert.ok(caption.startsWith("| 미셸 공드리 - 이터널 선샤인 (2004)"), "감독 - 제목 (연도)");
  assert.match(caption, /\(260912 21:40\)$/);
  assert.deepEqual(tagsOf(caption), [
    "미셸공드리", "이터널선샤인", "영화추천", "오늘의영화", "영화기록",
  ]);
});

test("a curation caption carries its own marker", () => {
  const caption = buildMovieCarouselCaption({ headline: "★5를 준 40편" }, now);
  assert.ok(caption.startsWith("| ★5를 준 40편"), "묶음은 크레딧 자리에 헤드라인을 쓴다");
  // 감독도 제목도 없는 묶음이라 계정 표식이 첫 자리를 쓴다
  assert.deepEqual(tagsOf(caption), ["Cyno", "영화추천", "오늘의영화", "영화기록"]);
  // 사람이 고른 세트는 고정 셋보다 앞이다 — 안 그러면 다섯 개 안에서 밀려난다
  const picked = tagsOf(buildMovieCarouselCaption({ headline: "여름" }, now, ["여름영화", "재개봉"]));
  assert.deepEqual(picked.slice(0, 3), ["Cyno", "여름영화", "재개봉"]);
});
