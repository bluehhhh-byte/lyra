import { getAllSongsMeta } from "../../../../lib/songs";
import { toHomeSong } from "../../../../lib/home-song-list";

export const revalidate = 21600;

export async function GET() {
  const songs = (await getAllSongsMeta()).map(toHomeSong);
  return Response.json({ songs, total: songs.length });
}
