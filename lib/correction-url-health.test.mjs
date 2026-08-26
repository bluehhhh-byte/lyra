import assert from "node:assert/strict";
import { correctionUrlInventory, urlHealth } from "./url-health.js";

assert.equal(urlHealth(200), "alive");
assert.equal(urlHealth(302), "alive");
assert.equal(urlHealth(403), "blocked");
assert.equal(urlHealth(404), "dead");
assert.deepEqual(correctionUrlInventory([{ slug: "a", sourceUrl: " https://example.com/x " }, { slug: "b" }]), [
  { index: 0, slug: "a", url: "https://example.com/x" },
  { index: 1, slug: "b", url: "" },
]);
