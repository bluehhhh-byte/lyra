import Link from "next/link";
import { getAllSongsRuntime } from "../../lib/songs";
import { getAllMoviesRuntime } from "../../lib/movies";
import AdminForm from "./form";
import SongTools from "./song-tools";
import DeployControl from "./deploy-control";
import { contentFallbackActive, databaseContentEnabled, listRecentContentChanges } from "../../lib/content-db";
import { toAdminSong } from "../../lib/admin/admin-song";
import { currentDeployJob } from "../../lib/deploy-jobs";
import { buildAdminOverview } from "../../lib/admin/dashboard";
import AdminOverview from "./admin-overview";

export const metadata = { title: "곡 추가 | Lyra" };
export const dynamic = "force-dynamic"; // auth-gated, never prerender

export default async function AdminPage() {
  const contentInDatabase = databaseContentEnabled();
  let songs, movies, deployment, history;
  try {
    [songs, movies, deployment, history] = await Promise.all([
      getAllSongsRuntime(),
      getAllMoviesRuntime(),
      currentDeployJob().catch(() => null),
      contentInDatabase ? listRecentContentChanges(12).catch(() => []) : Promise.resolve([]),
    ]);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      msg: "admin_song_list_load_failed",
      route: "/admin",
      error: error instanceof Error ? error.message : String(error),
    }));
    throw error;
  }
  const adminSongs = songs.map(toAdminSong);
  const overview = buildAdminOverview({
    songs,
    movies,
    contentStore: contentInDatabase ? "neon" : "files",
    contentFallback: contentFallbackActive(),
    deployment,
    history,
  });
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">곡 추가</h1>
        <Link href="/admin/tools" className="text-sm text-muted transition hover:text-accent">
          → 관리 도구
        </Link>
        <div className="sm:ml-auto">
          <DeployControl contentInDatabase={contentInDatabase} />
        </div>
      </div>
      <AdminOverview overview={overview} />
      {!contentInDatabase && (
        <p className="mb-5  border border-line px-3 py-2 text-xs text-muted">
          현재 GitHub 파일 저장 모드입니다. 저장한 콘텐츠는 배포 후 사이트에 반영됩니다.
        </p>
      )}
      <AdminForm />

      <h2 className="mb-3 mt-16 text-lg font-bold">등록된 곡 ({adminSongs.length})</h2>
      <SongTools songs={adminSongs} />
    </>
  );
}
