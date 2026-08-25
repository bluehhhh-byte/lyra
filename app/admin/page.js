import Link from "next/link";
import { getAllSongsRuntime } from "../../lib/songs";
import AdminForm from "./form";
import SongTools from "./song-tools";
import DeployControl from "./deploy-control";
import { databaseContentEnabled } from "../../lib/content-db";

export const metadata = { title: "곡 추가 | Lyra" };
export const dynamic = "force-dynamic"; // auth-gated, never prerender

export default async function AdminPage() {
  const contentInDatabase = databaseContentEnabled();
  const songs = await getAllSongsRuntime();
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">곡 추가</h1>
        <Link href="/admin/movie" className="text-sm text-muted transition hover:text-accent">
          → 영화 관리로
        </Link>
        <Link href="/admin/moments" className="text-sm text-muted transition hover:text-accent">
          → 장면 관리로
        </Link>
        <Link href="/admin/tools" className="text-sm text-muted transition hover:text-accent">
          → 관리 도구
        </Link>
        <div className="sm:ml-auto">
          <DeployControl contentInDatabase={contentInDatabase} />
        </div>
      </div>
      <AdminForm />

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
