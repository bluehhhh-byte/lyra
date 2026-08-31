import { getAllSongsMeta } from "../../../../../lib/songs";
import { toHomeSong, HOME_PAGE_SIZE } from "../../../../../lib/home-song-list";

// 홈 "더 보기"의 지연 로딩 페이지 — 한 번에 HOME_PAGE_SIZE(80)곡만 내보낸다.
// 전곡 한 방(/api/songs/meta, 400KB+)은 콜드 경로에서 간헐적으로 실패해
// 에러 바운더리를 반복해서 띄웠다. 경로 파라미터(offset)라 페이지별로
// ISR 캐시되고, 검색·필터가 필요로 하는 전체 응답은 기존 경로가 계속 담당한다.
export const revalidate = 21600;

export async function GET(_request, { params }) {
  const { offset: rawOffset } = await params;
  const offset = Math.max(0, Math.floor(Number(rawOffset)) || 0);
  const all = await getAllSongsMeta();
  const songs = all.slice(offset, offset + HOME_PAGE_SIZE).map(toHomeSong);
  return Response.json({ songs, offset, total: all.length });
}
