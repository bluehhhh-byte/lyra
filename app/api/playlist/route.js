import fs from "fs";
import path from "path";
import { getAllSongs } from "../../../lib/songs";
import { appleUrl } from "../../../lib/apple";

// 플레이어의 이전·다음·셔플용 목록. 예전에는 레이아웃이 모든 페이지의 RSC 페이로드에
// 이 배열을 실어 보냈다 — 아무것도 재생하지 않는 방문자도 매 이동마다 받았다.
// 지금은 첫 재생 때 한 번만 가져간다. 빌드 산출물이 있으면 그걸 쓰고, 없으면(로컬)
// 곡 파일에서 만든다.
export const dynamic = "force-dynamic";

let CACHE = null;

export async function GET() {
  if (!CACHE) {
    const file = path.join(process.cwd(), "data", "playlist.json");
    try {
      CACHE = JSON.parse(fs.readFileSync(file, "utf8")).items;
    } catch {
      CACHE = getAllSongs()
        .filter((s) => s.preview)
        .map((s) => ({
          slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork, preview: s.preview,
          provider: s.preview_provider || "",
          externalUrl: appleUrl(s),
        }));
    }
  }
  return Response.json({ items: CACHE });
}
