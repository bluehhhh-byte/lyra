import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
const form = fs.readFileSync(new URL("../app/admin/form.js", import.meta.url), "utf8");

assert.match(api, /searchMusicBrainz\(query, \{ limit: PAGE, offset \}\)/, "MusicBrainz를 Apple과 함께 조회해야 한다");
assert.match(api, /Promise\.all\(\[/, "외부 검색 소스는 병렬로 조회해야 한다");
assert.match(api, /mergeExternalSongResults\(\[appleResults, musicBrainz\.results\], query\)/, "두 소스를 같은 순위 함수로 병합해야 한다");
assert.match(api, /searchItunesStore\(query, country, \{ limit: PAGE, offset \}\)/, "Apple 스토어 검색을 시간 제한 함수로 호출해야 한다");
assert.match(api, /external_url: \$\{external_url \|\| ""\}/, "MusicBrainz 원문 링크를 곡에 보존해야 한다");
assert.match(form, /searchSources\.join/, "관리자에 실제 검색 소스를 표시해야 한다");
assert.match(form, /c\.thumb \? \(/, "커버 없는 보조 결과에 빈 img를 렌더링하면 안 된다");
assert.match(form, /c\.sourceLabel/, "각 결과의 출처를 표시해야 한다");

console.log("admin external multi-source search integration contract passed");
