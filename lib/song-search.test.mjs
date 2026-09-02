import assert from "node:assert/strict";
import {
  filterAdminSongs,
  normalizeSongSearch,
  songSearchFields,
  songSearchScore,
} from "./admin/song-search.js";

const songs = [
  { slug: "holiday", title: "Holiday", title_ko: "휴일", artist: "Green Day", album: "Warning" },
  {
    slug: "忘れらんねえよ-なんもねえ",
    title: "なんもねえ",
    title_ko: "아무것도 없어",
    artist: "忘れらんねえよ",
    artist_ko: "와스레란네에요",
    album: "なんもねえ - Single",
    tags: ["J-Rock"],
    searchAliases: ["난모네", "Wasureranneyo"],
  },
  { slug: "ending", title: "世界が終わりました", title_ko: "세계가 끝났어", artist: "Yuuri", artist_ko: "유우리" },
  { slug: "feels", title: "Feels", artist: "Calvin Harris" },
  { slug: "beyonce-halo", title: "Halo", artist: "Beyoncé" },
  { slug: "holiday-road", title: "Holiday Road", artist: "Lindsey Buckingham" },
];

assert.equal(normalizeSongSearch("  Green   DAY  "), "green day");
assert.equal(normalizeSongSearch("Beyoncé"), "beyonce", "라틴 악센트는 접어야 한다");
assert.equal(normalizeSongSearch("浸食 〜lose-control〜"), "浸食 lose control", "문장부호 차이를 공백으로 통일해야 한다");
assert.deepEqual(filterAdminSongs(songs, "holiday").map((song) => song.slug), ["holiday", "holiday-road"]);
assert.deepEqual(filterAdminSongs(songs, "GREEN day").map((song) => song.slug), ["holiday"]);
assert.deepEqual(filterAdminSongs(songs, "세계 유우리").map((song) => song.slug), ["ending"]);
assert.deepEqual(filterAdminSongs(songs, "아무것도 없어").map((song) => song.slug), ["忘れらんねえよ-なんもねえ"]);
assert.deepEqual(filterAdminSongs(songs, "와스레란네에요").map((song) => song.slug), ["忘れらんねえよ-なんもねえ"]);
assert.deepEqual(filterAdminSongs(songs, "Wasureranneyo").map((song) => song.slug), ["忘れらんねえよ-なんもねえ"]);
assert.deepEqual(filterAdminSongs(songs, "J Rock").map((song) => song.slug), ["忘れらんねえよ-なんもねえ"]);
assert.deepEqual(filterAdminSongs(songs, "Beyonce").map((song) => song.slug), ["beyonce-halo"]);
assert.deepEqual(
  filterAdminSongs(songs, "holidy").map((song) => song.slug),
  ["holiday", "holiday-road"],
  "짧은 오타 한 글자로 제목 단어가 일치하는 곡을 찾아야 한다"
);
assert.deepEqual(filterAdminSongs(songs, "없는 곡"), []);
assert.equal(filterAdminSongs(songs, ""), songs, "빈 검색어는 원래 배열을 그대로 반환해야 한다");
assert.ok(songSearchScore(songs[0], "holiday") > songSearchScore(songs[5], "holiday"), "제목 완전 일치가 접두 일치보다 앞서야 한다");
assert.deepEqual(
  filterAdminSongs([...songs, { slug: "holidy-other", title: "Holida", artist: "Other" }], "holiday").map((song) => song.slug),
  ["holiday", "holiday-road"],
  "정상 일치가 있으면 유사 오타 후보를 결과에 섞지 않아야 한다"
);
assert.ok(songSearchFields(songs[1]).some((field) => field.value === "난모네"), "명시적 검색 별칭을 포함해야 한다");

console.log("admin multilingual ranked song search passed");
