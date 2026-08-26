import fs from "node:fs";
import path from "node:path";

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.isFile() && /\.(js|mjs)$/.test(entry.name) ? [target] : [];
  });
}

const css = fs.readFileSync("app/globals.css", "utf8");
const code = walk("app").map((file) => fs.readFileSync(file, "utf8")).join("\n");
const selectors = [...new Set([...css.matchAll(/^\s*\.([a-z][\w-]*)/gm)].map((match) => match[1]))].sort();
const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);
const unusedSelectors = selectors.filter((selector) => !new RegExp(`(?:className[^\\n]*|closest\\?\\.)[\\s\\S]{0,120}${selector}`).test(code));
const unusedKeyframes = keyframes.filter((name) => !new RegExp(`animation:[^;]*\\b${name}\\b`).test(css));

console.log(`사용자 클래스 ${selectors.length}개: ${selectors.join(", ")}`);
console.log(`keyframes ${keyframes.length}개: ${keyframes.join(", ")}`);
console.log(`미사용 클래스 ${unusedSelectors.length}개 · 미사용 keyframes ${unusedKeyframes.length}개`);

if (process.argv.includes("--check") && (unusedSelectors.length || unusedKeyframes.length)) {
  console.error(`미사용 후보: ${[...unusedSelectors, ...unusedKeyframes].join(", ")}`);
  process.exitCode = 1;
}
