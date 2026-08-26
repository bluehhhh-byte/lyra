import assert from "node:assert/strict";
import { hasUnsavedChanges, warnBeforeUnload } from "./admin/unsaved-warning.js";

assert.equal(hasUnsavedChanges(null, null), false, "아직 불러오지 않은 폼은 경고하지 않는다");
assert.equal(hasUnsavedChanges("원문", "원문"), false, "변경이 없으면 경고하지 않는다");
assert.equal(hasUnsavedChanges("수정", "원문"), true);
assert.equal(hasUnsavedChanges("복원 초안", null), true, "서버 읽기 실패 뒤 복원한 초안도 보호한다");

const cleanEvent = { prevented: false, preventDefault() { this.prevented = true; } };
assert.equal(warnBeforeUnload(cleanEvent, false), false);
assert.equal(cleanEvent.prevented, false);

const dirtyEvent = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
assert.equal(warnBeforeUnload(dirtyEvent, true), true);
assert.equal(dirtyEvent.prevented, true);
assert.equal(dirtyEvent.returnValue, "");

console.log("관리자 미저장 이탈 경고 검증 통과");
