import { getAllSongsRuntime } from "../../../lib/songs";
import { appleUrl } from "../../../lib/apple";

// 플레이어의 이전·다음·셔플용 목록. 예전에는 레이아웃이 모든 페이지의 RSC 페이로드에
// 이 배열을 실어 보냈다 — 아무것도 재생하지 않는 방문자도 매 이동마다 받았다.
// 지금은 첫 재생 때 한 번만 가져간다. 빌드 산출물이 있으면 그걸 쓰고, 없으면(로컬)
// 곡 파일에서 만든다.
export const dynamic = "force-dynamic";

export async function GET() {
  const items = (await getAllSongsRuntime())
    .filter((s) => s.preview)
    .map((s) => ({
      slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork, preview: s.preview,
      provider: s.preview_provider || "",
      externalUrl: appleUrl(s),
    }));
  // 재생 목록은 곡이 추가될 때만 바뀐다. CDN이 1시간 들고 있게 한다 — 매 첫 재생마다
  // 함수를 깨워 전곡을 직렬화할 이유가 없다. 새 곡이 셔플에 늦게 잡히는 최대 1시간은
  // 감수한다(stale-while-revalidate로 그 사이에도 응답은 즉시 나간다).
  return Response.json(
    { items },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
