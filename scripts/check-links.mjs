import fs from "node:fs";
import path from "node:path";

const buildRoot = path.join(".next", "server", "app");
const manifestPath = path.join(".next", "routes-manifest.json");
if (!fs.existsSync(buildRoot) || !fs.existsSync(manifestPath)) {
  console.error("빌드 산출물이 없습니다. pnpm build를 먼저 실행하세요.");
  process.exit(1);
}

function walk(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target, extension) : entry.isFile() && target.endsWith(extension) ? [target] : [];
  });
}

const htmlFiles = walk(buildRoot, ".html");
const htmlRoutes = new Set(htmlFiles.map((file) => {
  const relative = path.relative(buildRoot, file).replaceAll("\\", "/").replace(/\.html$/, "");
  return relative === "index" ? "/" : `/${relative}`;
}));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const appPaths = JSON.parse(fs.readFileSync(path.join(".next", "server", "app-paths-manifest.json"), "utf8"));
const staticRoutes = new Set((manifest.staticRoutes || []).map((route) => route.page));
const appRoutes = new Set(Object.keys(appPaths).map((route) => route.replace(/\/(?:page|route)$/, "") || "/"));
const dynamicRoutes = (manifest.dynamicRoutes || []).map((route) => ({ page: route.page, pattern: new RegExp(route.regex) }));

const normalize = (href) => {
  try {
    const raw = new URL(href.replaceAll("&amp;", "&"), "https://lyra.invalid").pathname.replace(/\/$/, "") || "/";
    return { raw, decoded: decodeURIComponent(raw) };
  } catch {
    return null;
  }
};
const exists = ({ raw, decoded }) => htmlRoutes.has(decoded)
  || staticRoutes.has(decoded)
  || appRoutes.has(decoded)
  || dynamicRoutes.some(({ pattern }) => pattern.test(raw) || pattern.test(decoded))
  || fs.existsSync(path.join("public", decoded.replace(/^\//, "")));

const failures = [];
let checked = 0;
let external = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (!href.startsWith("/") || href.startsWith("//")) {
      external += 1;
      continue;
    }
    checked += 1;
    const route = normalize(href);
    if (!route || !exists(route)) failures.push({ file: path.relative(buildRoot, file), href });
  }
}

console.log(`HTML ${htmlFiles.length}개 · 내부 링크 ${checked}개 · 외부/앵커 제외 ${external}개`);
if (failures.length) {
  for (const failure of failures.slice(0, 50)) console.error(`✗ ${failure.file}: ${failure.href}`);
  console.error(`내부 링크 ${failures.length}개가 빌드 라우트와 일치하지 않습니다.`);
  process.exit(1);
}
console.log("내부 링크 404 후보 0개");
