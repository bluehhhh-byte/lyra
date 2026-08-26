import assert from "node:assert/strict";
import { readRecentSearches, rememberRecentSearch, SEARCH_RECENT_LIMIT } from "./search-history.js";

const values = new Map();
const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
let recent = [];
for (const query of ["a", "b", "c", "d", "e", "f"]) recent = rememberRecentSearch(storage, recent, query);
assert.equal(recent.length, SEARCH_RECENT_LIMIT);
assert.deepEqual(recent, ["f", "e", "d", "c", "b"]);
recent = rememberRecentSearch(storage, recent, "d");
assert.deepEqual(recent, ["d", "f", "e", "c", "b"], "중복 검색은 맨 앞으로 이동");
assert.deepEqual(readRecentSearches(storage), recent);
const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
assert.deepEqual(readRecentSearches(blocked), []);
assert.deepEqual(rememberRecentSearch(blocked, [], "검색"), ["검색"]);
console.log("✓ 최근 검색 5개·중복 이동·저장소 오류 안전");
