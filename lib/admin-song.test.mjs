import assert from "node:assert/strict";
import fs from "node:fs";
import { toAdminSong } from "./admin/admin-song.js";

assert.deepEqual(toAdminSong(), {
  slug: "",
  title: "(제목 없음)",
  title_ko: "",
  artist: "(아티스트 없음)",
  artist_ko: "",
  album: "",
  tags: [],
  searchAliases: [],
  artwork: "",
  comment: "",
  hasTranslation: false,
});

assert.equal(toAdminSong({ stanzas: [{ lines: [{ ko: "번역" }] }] }).hasTranslation, true);
assert.equal(toAdminSong({ stanzas: [{ lines: null }, null] }).hasTranslation, false);
assert.equal(toAdminSong({ artwork: { url: "wrong" }, comment: 42 }).artwork, "");
assert.deepEqual(
  toAdminSong({ title_ko: "아무것도 없어", artist_ko: "와스레란네에요", album: "싱글", tags: ["J-Rock"], search_aliases: ["난모네"] }),
  {
    slug: "", title: "(제목 없음)", title_ko: "아무것도 없어",
    artist: "(아티스트 없음)", artist_ko: "와스레란네에요", album: "싱글",
    tags: ["J-Rock"], searchAliases: ["난모네"], artwork: "", comment: "", hasTranslation: false,
  }
);

console.log("admin song adapter passed");

const form = fs.readFileSync(new URL("../app/admin/form.js", import.meta.url), "utf8");
const tools = fs.readFileSync(new URL("../app/admin/song-tools.js", import.meta.url), "utf8");
assert.match(form, /c\.registered.*등록됨/s, "외부 검색 결과에서 등록 여부를 표시해야 한다");
assert.match(form, /기존 곡 페이지 보기/, "저장 충돌 시 기존 곡으로 이동할 수 있어야 한다");
assert.match(tools, /중복 후보.*검토/s, "기존 중복 후보 검토 목록이 필요하다");
assert.match(tools, /이 기록을 대표로/, "대표 기록은 관리자가 직접 골라야 한다");
assert.match(tools, /mergeDuplicate/, "검토한 중복을 서버 병합 액션으로 보내야 한다");
console.log("admin duplicate review UI passed");
