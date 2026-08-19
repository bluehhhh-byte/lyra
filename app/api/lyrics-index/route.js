import { getAllSongsRuntime } from "../../../lib/songs";

// Lyric search index, split out of the home payload so the initial render
// doesn't ship every song's full lyrics. browse.js fetches this lazily on the
// first search keystroke. Runtime storage is tag-cached, so a DB save can
// invalidate this response without rebuilding the application.
export const dynamic = "force-dynamic";

export async function GET() {
  const index = (await getAllSongsRuntime()).map((s) => ({
    slug: s.slug,
    lines: s.stanzas.flatMap((st) => st.lines.flatMap((l) => [l.en, l.ko])).filter(Boolean),
  }));
  // 가사 인덱스는 곡이 바뀔 때만 바뀐다. 첫 검색 키 입력마다 함수가 전곡을
  // 직렬화할 이유가 없다 — CDN이 1시간 들고 있게 한다.
  return Response.json(index, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
