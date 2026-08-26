import assert from "node:assert/strict";
import { clearSongDraft, readSongDraft, songDraftKey, writeSongDraft } from "./admin/draft.js";

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

assert.match(songDraftKey("한글 slug"), /^lyra:admin-song-draft:/);
assert.equal(writeSongDraft(storage, "song", "수정 중", () => "2026-08-27T00:00:00.000Z"), true);
assert.deepEqual(readSongDraft(storage, "song"), {
  raw: "수정 중",
  savedAt: "2026-08-27T00:00:00.000Z",
});
assert.equal(clearSongDraft(storage, "song"), true);
assert.equal(readSongDraft(storage, "song"), null, "저장 성공 뒤 초안이 남지 않아야 한다");

const blocked = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
  removeItem() { throw new Error("blocked"); },
};
assert.equal(readSongDraft(blocked, "song"), null);
assert.equal(writeSongDraft(blocked, "song", "원고"), false);
assert.equal(clearSongDraft(blocked, "song"), false);

console.log("관리자 초안 보존 검증 통과");
