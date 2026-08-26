import assert from "node:assert/strict";
import { externalBodyApproval, lineHash } from "./admin/corrections.js";

assert.equal(lineHash("  같은 줄\u00a0"), lineHash("같은 줄"));

const valid = {
  slug: "song",
  type: "version_mismatch",
  field: "body",
  scope: "external_body",
  sourceUrl: "https://example.com/lyrics",
  beforeHash: "a".repeat(40),
  afterHash: "b".repeat(40),
};
assert.equal(externalBodyApproval([valid], "song"), valid);
assert.equal(externalBodyApproval([{ ...valid, sourceUrl: "" }], "song"), null, "출처 없는 예외 금지");
assert.equal(externalBodyApproval([{ ...valid, afterHash: "b".repeat(12) }], "song"), null, "본문 해시 없는 예외 금지");
assert.equal(externalBodyApproval([{ ...valid, scope: "line" }], "song"), null, "명시적 외부 본문 범위만 허용");

console.log("corrections tests passed");
