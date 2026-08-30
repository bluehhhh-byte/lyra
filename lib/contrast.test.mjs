import assert from "node:assert/strict";
import test from "node:test";
import { contrastRatio, relativeLuminance } from "./contrast.js";

test("WCAG relative luminance and contrast reference values", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.throws(() => contrastRatio("red", "#fff"), /6자리 hex/);
});

test("all normal-text theme token pairs meet 4.5 to 1", () => {
  const themes = {
    dark: { bg: "#12100e", surface: "#211d19", ink: "#eee7d2", muted: "#a89f8d", accent: "#c8b6ff" },
    light: { bg: "#f6f1e4", surface: "#efe8d6", ink: "#2a251f", muted: "#70685a", accent: "#6244cc" },
  };
  for (const [name, colors] of Object.entries(themes)) {
    for (const foreground of ["ink", "muted", "accent"])
      for (const background of ["bg", "surface"])
        assert.ok(contrastRatio(colors[foreground], colors[background]) >= 4.5, `${name} ${foreground}/${background}`);
    assert.ok(contrastRatio(colors.bg, colors.accent) >= 4.5, `${name} bg/accent button`);
  }
});
