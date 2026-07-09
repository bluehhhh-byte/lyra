import { getAllSongs } from "../../lib/songs";
import AdminForm from "./form";
import Backfill from "./backfill";
import Requality from "./requality";
import SongTools from "./song-tools";

export const metadata = { title: "곡 추가 | Lyra" };
export const dynamic = "force-dynamic"; // auth-gated, never prerender

export default function AdminPage() {
  const songs = getAllSongs();
  return (
    <>
      <h1 className="mb-8 text-2xl font-bold">곡 추가</h1>
      <AdminForm />

      <h2 className="mb-3 mt-16 text-lg font-bold">누락 항목 보정</h2>
      <Backfill />

      <h2 className="mb-3 mt-16 text-lg font-bold">가사 품질 재검사</h2>
      <Requality />

      <h2 className="mb-3 mt-16 text-lg font-bold">등록된 곡 ({songs.length})</h2>
      <SongTools
        songs={songs.map((s) => ({
          slug: s.slug,
          title: s.title,
          artist: s.artist,
          artwork: s.artwork,
          comment: s.comment || "",
          hasTranslation: s.stanzas.some((st) => st.lines.some((l) => l.ko)),
        }))}
      />
    </>
  );
}
