import assert from "node:assert/strict";
import {
  buildSearchQueries,
  externalSongScore,
  knownArtistSet,
  mergeExternalSongResults,
  searchQualityMetrics,
} from "./admin/music-search.js";
import { APPLE_SEARCH_CACHE_SECONDS, fetchArtistCatalog, itunesToResult, searchItunesStore, searchItunesStorePage } from "./admin/itunes.js";

// 커버도 미리듣기도 없는 빈약한 후보 — 병합기가 Apple 쪽을 고르는지 보기 위한 것이다.
const mb = {
  trackId: "",
  source: "other",
  sourceLabel: "기타",
  sourceId: "x-1",
  sourceScore: 98,
  aliases: [],
  title: "Rare Song",
  artist: "Rare Artist feat. Guest",
  album: "Official Album",
  artwork: "",
  thumb: "",
  duration: 0,
  year: "",
  genre: "",
  preview: "",
  external_url: "",
};

const apple = itunesToResult({
  trackId: 10, trackName: "Rare Song", artistName: "Rare Artist feat. Guest", collectionName: "Apple Album",
  artworkUrl100: "https://img/100x100.jpg", previewUrl: "https://audio", trackViewUrl: "https://music.apple/track",
  trackTimeMillis: 200000, releaseDate: "1999-03-02", primaryGenreName: "Rock",
});
assert.equal(apple.source, "apple");
assert.equal(apple.external_url, "https://music.apple/track");
assert.deepEqual(mergeExternalSongResults([[mb], [apple]], "rare song rare artist"), [apple], "같은 곡은 정보가 풍부한 Apple 결과를 남긴다");

const exact = { ...apple, title: "Wanted", artist: "Original" };
const cover = { ...apple, trackId: 11, title: "Wanted (Karaoke Cover)", artist: "Tribute Band" };
assert.ok(externalSongScore(exact, "Wanted Original") > externalSongScore(cover, "Wanted Original"));

// 밴드 이름이 곡 제목과 같은 경우 — "myaku"는 DIR EN GREY의 곡이면서 다른 밴드의
// 이름이다. 그 밴드의 아무 곡이나 제목이 정확히 일치하는 곡보다 앞서면, 찾던 곡이
// 남의 앨범 뒤로 밀려 사실상 검색되지 않는다.
const titleHit = { ...apple, title: "Myaku", artist: "DIR EN GREY" };
const artistHit = { ...apple, trackId: 12, title: "The Fallout from Vegas", artist: "MYAKU" };
assert.ok(
  externalSongScore(titleHit, "myaku") > externalSongScore(artistHit, "myaku"),
  "제목이 query와 같은 곡이 이름만 같은 밴드의 다른 곡보다 앞선다",
);

// 제목만으로는 갈리지 않는 흔한 이름 — 서재에 있는 아티스트 쪽을 앞에 둔다
const stranger = { ...apple, trackId: 13, title: "Myaku", artist: "saccharin" };
const known = knownArtistSet([{ artist: "DIR EN GREY" }, { artist: "Yuuri", artistKo: "유우리" }]);
assert.ok(known.has("dir en grey") && known.has("유우리"), "원어·한글 아티스트명을 모두 담는다");
assert.equal(externalSongScore(titleHit, "myaku"), externalSongScore(stranger, "myaku"));
assert.ok(
  externalSongScore(titleHit, "myaku", known) > externalSongScore(stranger, "myaku", known),
  "이미 등록된 아티스트의 곡이 같은 제목의 남의 곡보다 앞선다",
);
assert.ok(
  externalSongScore(stranger, "myaku", known) > externalSongScore(artistHit, "myaku", known),
  "서재 가산이 제목 일치를 뒤집지는 못한다",
);

let appleRequest;
const storeRows = await searchItunesStore("なんもねえ", "JP", {
  fetchImpl: async (url, options) => {
    appleRequest = { url: String(url), options };
    return { ok: true, json: async () => ({ results: [{ trackId: 1 }] }) };
  },
});
assert.equal(storeRows.length, 1);
assert.match(appleRequest.url, /country=JP/);
assert.match(appleRequest.url, /lang=ja_jp/);
assert.match(appleRequest.url, /explicit=Yes/);
assert.equal(appleRequest.options.cache, "force-cache");
assert.equal(appleRequest.options.next.revalidate, APPLE_SEARCH_CACHE_SECONDS);
assert.deepEqual(await searchItunesStore("x", "US", { fetchImpl: async () => { throw new Error("offline"); } }), []);

let pagedUrl = "";
const page = await searchItunesStorePage("Rare Song", "US", {
  limit: 50,
  offset: 50,
  fetchImpl: async (url) => {
    pagedUrl = String(url);
    return { ok: true, json: async () => ({ results: Array.from({ length: 100 }, (_, index) => ({ trackId: index })) }) };
  },
});
assert.match(pagedUrl, /limit=100/);
assert.doesNotMatch(pagedUrl, /offset=/, "Apple의 문서화되지 않은 offset에 의존하지 않는다");
assert.equal(page.results[0].trackId, 50);
assert.equal(page.nextOffset, 100);

const catalogRequests = [];
const catalog = await fetchArtistCatalog("Rare Artist Rare Song", {
  fetchImpl: async (url, options) => {
    catalogRequests.push({ url: String(url), options });
    if (String(url).includes("entity=musicArtist")) return {
      json: async () => ({ results: [{ artistId: 77, artistName: "Rare Artist" }] }),
    };
    return {
      json: async () => ({ results: [{ wrapperType: "track", trackId: 10, trackName: "Rare Song", artistName: "Rare Artist" }] }),
    };
  },
});
assert.equal(catalog.length, 1);
assert.ok(catalogRequests.length >= 3);
for (const request of catalogRequests) {
  assert.equal(request.options.cache, "force-cache", "아티스트 검색과 카탈로그 lookup을 모두 캐시해야 한다");
  assert.equal(request.options.next.revalidate, APPLE_SEARCH_CACHE_SECONDS);
  assert.ok(request.options.signal, "느린 Apple 요청을 취소할 수 있어야 한다");
}

const variants = buildSearchQueries("세계가 끝났어 유우리", [{
  title: "The World Has Ended", titleKo: "세계가 끝났어", artist: "Yuuri", artistKo: "유우리",
}]);
assert.deepEqual(variants, ["세계가 끝났어 유우리", "世界が終わりました 優里"]);

const metrics = searchQualityMetrics(
  [{ query: "wanted original", expectedTitle: "Wanted", expectedArtist: "Original" }],
  { "wanted original": [cover, exact] },
);
assert.equal(metrics.top1, 0);
assert.equal(metrics.top5, 1);

console.log("multi-source external song search passed");
