import { currentSearchIndex } from "../../../../lib/search-index";
import { lyricMatches, LYRIC_QUERY_MIN } from "../../../../lib/lyric-search";

// 홈의 가사 검색 — 일치한 slug와 맞은 줄만 돌려준다.
//
// 예전에는 홈이 첫 검색 때 /api/lyrics-index로 전곡 가사(gzip 757KB)를 통째로
// 내려받아 클라이언트에서 걸렀다. 검색어 하나에 필요한 것은 "어느 곡의 어느 줄이
// 맞았나"뿐이다 — 그것만 보내면 몇 KB다.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const q = new URL(request.url).searchParams.get("q") || "";
  if (q.trim().length < LYRIC_QUERY_MIN)
    return Response.json({ q: q.trim().toLowerCase(), hits: [] });
  const db = await currentSearchIndex();
  const result = lyricMatches(db.songs, q);
  // 같은 검색어는 CDN이 잠깐 들고 있어도 된다 — 타이핑 백스페이스 왕복이 흔하다
  return Response.json(result, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
