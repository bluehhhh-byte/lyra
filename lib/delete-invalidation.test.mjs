// 지운 것이 목록에 남아 보이지 않아야 한다.
//
// Mr. Big <Take Cover>를 지웠는데 홈에 그대로 있었다. DB에서는 사라졌고 검색
// API도 비었고 상세 페이지도 곡 내용을 하나도 렌더하지 않았는데, 홈만 2.4시간 된
// HTML(Age 8635)을 계속 내놓았다. 태그 무효화는 데이터 캐시만 비우고, 이미
// 만들어진 HTML은 6시간짜리 라우트 캐시에 따로 살아 있기 때문이다.
//
// 지운 곡이 실려 있던 목록이 어디까지인지는 우리가 모른다 — 홈, 아카이브, 통계,
// 취향, 태그별 페이지, 같은 앨범 동반곡. 그래서 삭제에서는 루트 아래를 통째로 턴다.
//   node --test lib/delete-invalidation.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const store = fs.readFileSync(new URL("./store.js", import.meta.url), "utf8");

test("deleting clears every page under the root, saving does not", () => {
  // "layout"은 루트 아래 전부를 비운다. 저장할 때마다 그러면 626개 페이지가
  // 한꺼번에 다시 렌더돼 Neon을 다시 태운다 — 삭제는 드무니 삭제에서만 쓴다.
  assert.match(store, /if \(removed\) revalidatePath\("\/", "layout"\)/);
  assert.match(store, /await invalidate\(kind, safeSlug\(slug\), \{ removed: true \}\)/, "remove가 플래그를 넘겨야 한다");

  const write = store.slice(store.indexOf("const write = async"), store.indexOf("const remove = async"));
  assert.match(write, /await invalidate\(kind, safeSlug\(slug\)\);/, "저장은 가벼운 쪽을 그대로 쓴다");
  assert.ok(!/removed: true/.test(write), "저장이 사이트 전체를 비우면 안 된다");
});

test("the manual purge endpoint clears the lists too", () => {
  // 손으로 비우러 온 사람은 "전부 비우라"는 뜻이다. 상세 라우트만 털면 홈은 남는다.
  const route = fs.readFileSync(new URL("../app/api/revalidate/route.js", import.meta.url), "utf8");
  assert.match(route, /revalidatePath\("\/", "layout"\)/);
  assert.match(route, /for \(const route of DETAIL_ROUTES\) revalidatePath\(route, "page"\)/);
});

test("tag invalidation stays — it is what clears the data cache", () => {
  // 라우트 캐시만 털고 데이터 캐시를 두면, 다시 렌더한 HTML이 옛 데이터로 만들어진다.
  assert.match(store, /revalidateTag\("lyra-content"\)/);
  assert.match(store, /revalidateTag\(kind === "song" \? "lyra-songs" : "lyra-movies"\)/);
  assert.match(store, /revalidateTag\(rowTag\(kind, slug\)\)/);
});
