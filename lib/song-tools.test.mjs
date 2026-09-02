import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../app/admin/song-tools.js", import.meta.url), "utf8");

assert.ok(!/\bregenAll\b/.test(src), "전곡 메타 재생성 반복문이 다시 추가됐다");
assert.ok(!/전체 메타/.test(src), "전곡 메타 재생성 버튼이 다시 추가됐다");
assert.ok(/onClick=\{\(\) => regenMeta\(s\.slug\)\}/.test(src), "곡별 메타 재생성 기능이 사라졌다");
assert.ok(/s\.artwork \? \(/.test(src), "커버가 없는 곡에 빈 img src를 렌더링하면 안 된다");
assert.ok(/filterAdminSongs\(songs, query\)/.test(src), "등록된 곡 검색 결과를 목록에 적용해야 한다");
assert.ok(/id="registered-song-search"/.test(src), "등록된 곡 검색 입력이 필요하다");
assert.ok(/filteredSongs\.map/.test(src), "등록된 곡 목록은 검색 결과를 렌더링해야 한다");
assert.ok(/s\.title_ko/.test(src), "검색된 곡의 한글 제목을 함께 표시해야 한다");
assert.ok(/s\.artist_ko/.test(src), "검색된 곡의 한글 아티스트명을 함께 표시해야 한다");
assert.ok(/일치하는 곡이 없습니다/.test(src), "검색 결과가 없을 때 안내해야 한다");

console.log("✓ 전곡 메타 재생성은 없고 곡별 기능은 유지");
