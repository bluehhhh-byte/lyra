import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
const form = fs.readFileSync(new URL("../app/admin/form.js", import.meta.url), "utf8");

// MusicBrainz를 뺀 뒤 남은 외부 조회는 Apple 3개 스토어와 아티스트 카탈로그다.
assert.match(api, /mergeExternalSongResults\(\[appleResults\], searchQueries\)/, "Apple 결과만 병합한다");
assert.doesNotMatch(api, /musicbrainz/i, "MusicBrainz 배선이 남아 있으면 안 된다");
assert.match(api, /Promise\.all\(\[/, "스토어 조회는 병렬로 해야 한다");
assert.match(api, /const registeredSongs = await getAllSongsMeta\(\)/, "등록곡 목록을 검색 별칭과 중복 판정에 한 번만 읽어야 한다");
assert.match(api, /buildSearchQueries\(query, registeredSongs\)/, "기존 번역 제목·아티스트 표기를 검색 별칭으로 써야 한다");
assert.match(api, /registered: findDuplicateSong\(result, registeredSongs\)/, "외부 검색 결과에 등록 여부를 붙여야 한다");
assert.match(api, /country === "JP" \? externalQuery : query/, "일본 스토어는 원어 확장, 다른 스토어는 입력 원문을 사용해야 한다");
assert.match(api, /sourceStatus/, "검색원 부분 장애를 응답에 포함해야 한다");
assert.match(form, /searchSources\.join/, "관리자에 실제 검색 소스를 표시해야 한다");
assert.match(form, /c\.thumb \? \(/, "커버 없는 보조 결과에 빈 img를 렌더링하면 안 된다");
assert.match(form, /c\.sourceLabel/, "각 결과의 출처를 표시해야 한다");
assert.match(form, /전체 재시도/, "검색원 장애를 관리자가 재시도할 수 있어야 한다");
assert.match(form, /more\.nextCursor/, "더 보기는 검색원별 커서를 사용해야 한다");

assert.doesNotMatch(form, /MusicBrainz/i, "관리자 안내 문구에도 MusicBrainz가 남으면 안 된다");

console.log("admin external search integration contract passed");
