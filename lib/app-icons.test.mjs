import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const files = ["app/icon.png", "app/apple-icon.png", "public/icon-192.png", "public/icon-512.png"];
for (const file of files) assert.equal(existsSync(new URL(file, root)), true, `${file}가 있어야 한다`);

const digest = (file) => createHash("sha256").update(readFileSync(new URL(file, root))).digest("hex");
assert.equal(digest("app/icon.png"), digest("public/icon-192.png"), "탭 아이콘은 검증된 앱 아이콘 자산을 재사용한다");

const manifest = readFileSync(new URL("app/manifest.js", root), "utf8");
assert.match(manifest, /\/icon-192\.png/);
assert.match(manifest, /\/icon-512\.png/);
