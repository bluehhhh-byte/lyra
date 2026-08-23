// production 쓰기는 Neon이 아니면 실패한다 — GitHub로 새지 않는다.
//
// 예전에는 LYRA_CONTENT_STORE=neon이 빠지고 GITHUB_TOKEN·GITHUB_REPO가 남아 있으면
// 저장이 조용히 GitHub Contents API로 넘어갔다. 그 API는 파일당 커밋을 만든다.
// 2026-08-01에 왓챠 임포트 1,011건이 11분 만에 1,059커밋을 만들어 계정이 abuse
// 플래그에 걸렸고 push 이벤트 발화가 멈췄다. 환경변수 하나를 빠뜨린 대가로
// 같은 일이 다시 일어나서는 안 된다.
//
// store.js는 모듈 로드 시점에 환경변수를 읽으므로 import 전에 환경을 세운다.
// 그래서 이 파일은 별도 프로세스로 도는 독립 테스트다(러너가 파일마다 프로세스를 띄운다).
//   node lib/store-production.test.mjs
import assert from "node:assert/strict";

// production + Neon 꺼짐 + GitHub 자격증명 있음 = 과거에 사고가 났던 바로 그 조합
process.env.NODE_ENV = "production";
delete process.env.LYRA_CONTENT_STORE;
process.env.GITHUB_REPO = "example/repo";
process.env.GITHUB_TOKEN = "test-token-not-a-real-secret";

// fetch를 감시한다 — GitHub로 나가는 요청이 하나라도 있으면 실패
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push(String(url));
  throw new Error("이 테스트에서는 네트워크 요청이 일어나면 안 된다");
};

const { commitFiles, songs, movies } = await import("./store.js");

const shouldReject = async (label, run) => {
  await assert.rejects(run, /Neon/, `${label}: Neon을 요구하는 오류여야 한다`);
};

// 1) 일괄 저장
await shouldReject("commitFiles", () =>
  commitFiles([{ path: "songs/a.md", content: "A" }], "test")
);

// 2) 단건 저장·삭제 — 스토어 표면 전체가 닫혀 있어야 한다
if (songs?.write) await shouldReject("songs.write", () => songs.write("a", "A"));
if (songs?.remove) await shouldReject("songs.remove", () => songs.remove("a"));
if (movies?.write) await shouldReject("movies.write", () => movies.write("m", "M"));
if (movies?.remove) await shouldReject("movies.remove", () => movies.remove("m"));

// 3) 핵심 — GitHub API를 한 번도 부르지 않았다
assert.equal(
  calls.length,
  0,
  `production 오설정에서 외부 요청이 발생했다: ${calls.join(", ")}`
);
assert.ok(
  !calls.some((url) => url.includes("api.github.com")),
  "GitHub API 호출은 어떤 경우에도 있어서는 안 된다"
);

// 4) 오류 메시지가 해결 방법을 알려주되 비밀값은 흘리지 않는다
{
  const error = await commitFiles([{ path: "songs/a.md", content: "A" }], "test").catch((e) => e);
  assert.match(error.message, /LYRA_CONTENT_STORE/, "무엇을 설정해야 하는지 말해야 한다");
  assert.ok(!error.message.includes("test-token-not-a-real-secret"), "토큰 값을 노출하면 안 된다");
  assert.ok(!error.message.includes("example/repo"), "저장소 이름도 굳이 노출할 필요 없다");
}

console.log("✓ production 쓰기 fail-closed — GitHub 호출 0회, Neon 요구 오류");
