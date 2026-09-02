import assert from "node:assert/strict";
import {
  MUSICBRAINZ_USER_AGENT,
  credibleExternalSong,
  externalSongScore,
  mergeExternalSongResults,
  musicBrainzToResult,
  searchMusicBrainz,
} from "./admin/music-search.js";
import { itunesToResult, searchItunesStore } from "./admin/itunes.js";

const mb = musicBrainzToResult({
  id: "mb-1",
  title: "Rare Song",
  score: 98,
  length: 201000,
  "first-release-date": "1999-03-02",
  "artist-credit": [{ name: "Rare Artist", joinphrase: " feat. " }, { name: "Guest" }],
  releases: [{ id: "boot", title: "Bootleg", status: "Bootleg" }, { id: "official", title: "Official Album", status: "Official" }],
  tags: [{ name: "rock", count: 2 }, { name: "indie", count: 8 }],
});
assert.deepEqual(mb, {
  trackId: "", source: "musicbrainz", sourceLabel: "MusicBrainz", sourceId: "mb-1", sourceScore: 98,
  title: "Rare Song", artist: "Rare Artist feat. Guest", album: "Official Album", artwork: "", thumb: "",
  duration: 201, year: "1999", genre: "indie", preview: "", external_url: "https://musicbrainz.org/recording/mb-1",
});

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
assert.equal(credibleExternalSong({ ...mb, sourceScore: 45, title: "Another Song" }, "Wanted Rare Artist"), false);
assert.equal(credibleExternalSong({ ...mb, sourceScore: 90, title: "Alias Title" }, "번역 별칭"), true, "고신뢰 별칭 검색 결과는 남긴다");

let requested;
const response = await searchMusicBrainz("rare song", {
  fetchImpl: async (url, options) => {
    requested = { url: String(url), options };
    return { ok: true, json: async () => ({ count: 2, offset: 0, recordings: [{ id: "x", title: "Rare Song", "artist-credit": [{ name: "Rare Artist" }] }] }) };
  },
});
assert.equal(response.results.length, 1);
assert.equal(response.hasMore, true);
assert.match(requested.url, /recording\/\?/);
assert.match(requested.url, /dismax=true/);
assert.equal(requested.options.headers["User-Agent"], MUSICBRAINZ_USER_AGENT);

const failed = await searchMusicBrainz("rare song", { fetchImpl: async () => { throw new Error("offline"); } });
assert.deepEqual(failed, { results: [], hasMore: false }, "MusicBrainz 장애는 Apple 검색을 막지 않아야 한다");

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
assert.equal(appleRequest.options.next.revalidate, 900);
assert.deepEqual(await searchItunesStore("x", "US", { fetchImpl: async () => { throw new Error("offline"); } }), []);

console.log("multi-source external song search passed");
