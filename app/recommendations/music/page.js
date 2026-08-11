import Link from "next/link";
import { readData } from "../../../lib/store";
import { getAllSongs } from "../../../lib/songs";
import { normText } from "../../../lib/admin/itunes";
import SongRecs from "../song-recs";

export const metadata = {
  title: "추천 곡 | Lyra",
  description: "컬렉션 취향을 바탕으로 Gemini가 추천한, 아직 담지 않은 곡들",
};

// 관리자 → 등록된 곡 → "추천 곡 생성"이 누적하는 data/song-recs.json.
// 새 추천이 위에 얹히고, 그새 컬렉션에 담은 곡은 다음 생성 때 빠진다.
export default function MusicRecommendationsPage() {
  const recs = readData("song-recs.json", { items: [] });
  // 추천 후 컬렉션에 담은 곡은 다음 생성을 기다리지 않고 즉시 숨긴다
  const songs = getAllSongs();
  const haveTrack = new Set(songs.map((s) => String(s.trackId)).filter(Boolean));
  const haveKey = new Set(songs.map((s) => `${normText(s.title)}|${normText(s.artist)}`));
  const items = (recs.items || []).filter(
    (m) => !haveTrack.has(String(m.trackId)) && !haveKey.has(`${normText(m.title)}|${normText(m.artist)}`)
  );

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">추천 곡</h1>
          <p className="mt-1 text-sm text-muted">
            컬렉션 취향으로 고른, 아직 담지 않은 곡{items.length > 0 && ` · ${items.length}곡`} — ▶로 30초 미리듣기
          </p>
        </div>
        <div className="flex gap-4">
          <Link href="/songs/taste" className="text-sm text-accent hover:underline">
            음악 취향 →
          </Link>
          <Link href="/recommendations" className="text-sm text-accent hover:underline">
            추천 영화 →
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          아직 추천 곡이 없습니다.
          <br />
          관리자 → 등록된 곡에서 “추천 곡 생성”을 누르면 여기에 쌓입니다.
        </div>
      ) : (
        <SongRecs items={items} />
      )}
    </>
  );
}
