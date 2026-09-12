// JSX가 부르는 이름이 그 파일 안에 있는지 본다.
//
// app/movies/browse.js가 <Stars />를 쓰는데 import가 없었다. 별점 컴포넌트를
// 하나로 합치면서 세 소비자 중 둘만 import를 받았고, 남은 하나는 이틀 동안
// 프로덕션에서 ReferenceError로 죽었다 — 영화 목록이 통째로 안 떴다.
//
// 아무것도 이걸 잡지 못했다. next build는 JS를 타입 검사하지 않고, eslint는
// 의존성 금지라 없고, smoke는 HTML만 받아 보므로 클라이언트에서 나는 에러를
// 보지 못한다. 그래서 이 검사가 존재한다: 대문자 JSX 태그는 같은 파일 안에서
// import되었거나 선언되어 있어야 한다.
//   node --test lib/jsx-scope.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 한글이 든 경로는 URL에서 %EB%B0%95… 로 나온다 — pathname을 그대로 쓰면 안 된다
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : jsFiles(full);
    return /\.jsx?$/.test(entry.name) ? [full] : [];
  });
}

// 문자열·주석 안의 `<Foo />`는 코드가 아니다. 주석에 컴포넌트 이름을 적는 일이
// 흔하므로(이 파일도 그렇다) 지우고 봐야 한다. 정규식으로 지우면 따옴표 든
// 주석과 주석 같은 URL에서 어긋나므로 상태를 들고 한 글자씩 읽는다.
export function stripStringsAndComments(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (two === "/*") {
      i += 2;
      while (i < source.length && source.slice(i, i + 2) !== "*/") i++;
      i += 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i++;
      while (i < source.length && source[i] !== ch) i += source[i] === "\\" ? 2 : 1;
      i++;
      // 내용만 지우고 자리는 남긴다 — 지운 자리가 붙어 새 토큰이 생기면 안 된다
      out += '""';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// `<Foo`, `<Foo.Bar` — 소문자로 시작하는 건 HTML 요소이고, `<>`는 Fragment다
export function jsxComponentNames(code) {
  return new Set([...code.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
}

// import 된 이름과 이 파일에서 선언한 이름. 선언을 놓치면 거짓 경보가 나므로
// 값이 될 수 있는 형태는 모두 센다 — 못 미더우면 경보가 아니라 침묵 쪽으로.
export function namesInScope(code) {
  const names = new Set();
  // `[^;]`이라야 한 import 문 안에 머문다. `[\s\S]*?`로 두면 부작용 import
  // (`import "./globals.css";`)에서 시작한 매치가 다음 줄의 `from`까지 삼켜,
  // 그 사이에 있던 진짜 기본 import 이름이 통째로 사라진다.
  for (const [, clause] of code.matchAll(/import\s+([^;]*?)\s+from\s*""/g)) {
    for (const [, alias] of clause.matchAll(/(?:^|[{,*]|\bas\s)\s*([A-Za-z_$][\w$]*)/g)) names.add(alias);
    // `import Default, { a }` 의 Default
    const first = clause.match(/^\s*([A-Za-z_$][\w$]*)/);
    if (first) names.add(first[1]);
  }
  for (const [, name] of code.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(name);
  for (const [, name] of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(name);
  // 구조 분해로 받은 컴포넌트: `function Page({ Icon })`, `const { A, B } = x`
  for (const [, inner] of code.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*[,}=:]/g)) names.add(inner);
  return names;
}

test("every JSX component a file renders is in that file's scope", () => {
  const missing = [];
  for (const file of jsFiles(path.join(ROOT, "app"))) {
    const code = stripStringsAndComments(fs.readFileSync(file, "utf8"));
    const scope = namesInScope(code);
    for (const name of jsxComponentNames(code)) {
      if (!scope.has(name)) missing.push(`${path.relative(ROOT, file).replace(/\\/g, "/")}: <${name}>`);
    }
  }
  assert.deepEqual(missing, [], `import 없이 렌더하는 컴포넌트:\n  ${missing.join("\n  ")}`);
});

test("the scanner sees through comments and strings", () => {
  // 주석에 적은 이름을 잡으면 거짓 경보가 쏟아져 검사를 끄게 된다
  const commented = stripStringsAndComments('// <Ghost />\nconst a = "<Ghost />";\n<Real />');
  assert.deepEqual([...jsxComponentNames(commented)], ["Real"]);
  // 주석처럼 생긴 URL은 문자열 안이라 주석이 아니다
  assert.match(stripStringsAndComments('const u = "https://x.test"; <Real />'), /<Real \/>/);
});

test("a side-effect import does not swallow the one after it", () => {
  // `import "./globals.css";` 다음 줄의 기본 import가 통째로 사라져
  // app/layout.js의 <PlayerProvider>가 거짓 경보로 잡혔다
  const code = stripStringsAndComments('import "./globals.css";\nimport PlayerProvider from "./player";');
  assert.ok(namesInScope(code).has("PlayerProvider"));
});

test("the scanner would have caught the bug it was written for", () => {
  const withoutImport = 'import CoverImage from "../cover-image";\nexport default function B() { return <Stars value={1} />; }';
  assert.ok(!namesInScope(stripStringsAndComments(withoutImport)).has("Stars"));
  const withImport = `import Stars from "../stars";\n${withoutImport}`;
  assert.ok(namesInScope(stripStringsAndComments(withImport)).has("Stars"));
});
