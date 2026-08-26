import { contrastRatio } from "../lib/contrast.js";

const themes = {
  dark: { bg: "#0d0d0f", surface: "#16161a", ink: "#ededf0", muted: "#8a8a94", accent: "#c8b6ff" },
  light: { bg: "#fdfdfc", surface: "#f3f3f0", ink: "#1b1b1d", muted: "#66666e", accent: "#6244cc" },
};
let failed = 0;
for (const [theme, colors] of Object.entries(themes)) {
  for (const [foreground, background] of [["ink", "bg"], ["ink", "surface"], ["muted", "bg"], ["muted", "surface"], ["accent", "bg"], ["accent", "surface"], ["bg", "accent"]]) {
    const ratio = contrastRatio(colors[foreground], colors[background]);
    const ok = ratio >= 4.5;
    if (!ok) failed += 1;
    console.log(`${ok ? "✓" : "✗"} ${theme.padEnd(5)} ${foreground}/${background} ${ratio.toFixed(2)}:1`);
  }
}
if (failed) process.exitCode = 1;
