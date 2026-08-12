import Link from "next/link";
import { getAllSongs } from "../../lib/songs";
import AdminForm from "./form";
import Backfill from "./backfill";
import Lint from "./lint";
import Requality from "./requality";
import SongTools from "./song-tools";
import ArtworkReview from "./artwork-review";
import { readData } from "../../lib/store";

export const metadata = { title: "곡 추가 | Lyra" };
export const dynamic = "force-dynamic"; // auth-gated, never prerender

export default function AdminPage() {
  const songs = getAllSongs();
  // 커버 검토 대상: artwork 없고 '커버 없음 확정'도 아닌 곡 + 백필 감사 상태
  const artworkAudit = readData("artwork-backfill-audit.json", { items: [] });
  const auditStatus = new Map((artworkAudit.items || []).map((x) => [x.slug, x.status]));
  const artworkless = songs
    .filter((s) => !(s.artwork || "").startsWith("https") && !s.artwork_none)
    .map((s) => ({ slug: s.slug, title: s.title, artist: s.artist, year: s.year || "", status: auditStatus.get(s.slug) || "" }));
  return (
    <>
      <div className="mb-8 flex items-center gap-4">
        <h1 className="text-2xl font-bold">곡 추가</h1>
        <Link href="/admin/movie" className="text-sm text-muted transition hover:text-accent">
          → 영화 관리로
        </Link>
      </div>
      <AdminForm />

      <h2 className="mb-3 mt-16 text-lg font-bold">누락 항목 보정</h2>
      <Backfill />

      <h2 className="mb-3 mt-16 text-lg font-bold">커버 검토 ({artworkless.length})</h2>
      <ArtworkReview items={artworkless} />

      <h2 className="mb-3 mt-16 text-lg font-bold">번역 형식 검사</h2>
      <Lint />

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
