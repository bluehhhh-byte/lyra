import fs from "node:fs";
import path from "node:path";

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
  });
}

const files = walk("app");
const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const jsxForTags = source.replaceAll("=>", "⇒");
const css = fs.readFileSync("app/globals.css", "utf8");
const counts = Object.fromEntries(["a", "button", "input", "select", "textarea", "summary"].map((tag) => [
  tag,
  source.match(new RegExp(`<${tag}(?=[\\s>])`, "g"))?.length || 0,
]));
const nonSemanticClicks = [...jsxForTags.matchAll(/<(div|span|li|img)\b([^>]*)\bonClick=([^>]*)>/g)]
  .filter((match) => !/role="(?:button|link|slider|tab|switch|checkbox|dialog|document|presentation)"/.test(`${match[2]} ${match[3]}`))
  .map((match) => match[1]);
const focusRule = css.match(/:focus-visible\s*\{([^}]+)\}/)?.[1] || "";
const focusOffset = css.indexOf(":focus-visible");
const lateOutlineRemoval = focusOffset >= 0 && /outline(?:-style)?:\s*none/.test(css.slice(focusOffset));

console.log(`대화형 태그 ${Object.values(counts).reduce((sum, value) => sum + value, 0)}개: ${Object.entries(counts).map(([tag, count]) => `${tag} ${count}`).join(" · ")}`);
console.log(`비의미 요소 onClick ${nonSemanticClicks.length}개 · 전역 focus-visible ${focusRule ? "있음" : "없음"}`);

if (!/outline:\s*2px solid var\(--color-accent\)/.test(focusRule) || lateOutlineRemoval || nonSemanticClicks.length) {
  console.error("포커스 표시가 없거나, 뒤에서 제거되거나, 키보드로 닿지 않는 클릭 요소가 있습니다.");
  process.exitCode = 1;
}
