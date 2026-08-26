import assert from "node:assert/strict";
import { isEditableTarget, shouldOpenSearchShortcut } from "./search-shortcut.js";

const target = (tagName, extra = {}) => ({ tagName, closest: () => null, ...extra });
assert.equal(shouldOpenSearchShortcut({ ctrlKey: true, key: "k", target: target("DIV") }), true);
assert.equal(shouldOpenSearchShortcut({ metaKey: true, key: "K", target: target("DIV") }), true);
assert.equal(shouldOpenSearchShortcut({ ctrlKey: true, key: "k", target: target("INPUT") }), false);
assert.equal(shouldOpenSearchShortcut({ metaKey: true, key: "k", target: target("TEXTAREA") }), false);
assert.equal(isEditableTarget(target("DIV", { isContentEditable: true })), true);
assert.equal(shouldOpenSearchShortcut({ ctrlKey: true, altKey: true, key: "k", target: target("DIV") }), false);
console.log("✓ 검색 단축키 — Ctrl/Command+K·편집 중 가로채지 않음");
