import Link from "next/link";
import { getAllSongsRuntime } from "../../lib/songs";
import AdminForm from "./form";
import Backfill from "./backfill";
import Lint from "./lint";
import Requality from "./requality";
import SongTools from "./song-tools";
import ArtworkReview from "./artwork-review";
import LyricsAudit from "./lyrics-audit";
import BulkWork from "./bulk-work";
import DeployControl from "./deploy-control";
import { readRuntimeData } from "../../lib/store";
import { databaseContentEnabled } from "../../lib/content-db";

export const metadata = { title: "곡 추가 | Lyra" };
export const dynamic = "force-dynamic"; // auth-gated, never prerender

export default async function AdminPage() {
  const contentInDatabase = databaseContentEnabled();
  const [songs, artworkAudit] = await Promise.all([
    getAllSongsRuntime(),
    readRuntimeData("artwork-backfill-audit.json", { items: [] }),
  ]);
  // 커버 검토 대상: artwork 없고 '커버 없음 확정'도 아닌 곡 + 백필 감사 상태
  const auditStatus = new Map((artworkAudit.items || []).map((x) => [x.slug, x.status]));
  const artworkless = songs
    .filter((s) => !(s.artwork || "").startsWith("https") && !s.artwork_none)
    .map((s) => ({ slug: s.slug, title: s.title, artist: s.artist, year: s.year || "", status: auditStatus.get(s.slug) || "" }));
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
        <div className="sm:ml-auto">
          <DeployControl contentInDatabase={contentInDatabase} />
        </div>
      </div>
      <p className="mb-5 rounded-lg border border-line px-3 py-2 text-xs text-muted">
        {contentInDatabase
          ? "곡·영화 저장은 즉시 사이트에 반영됩니다. 배포 버튼은 코드 변경 때만 사용합니다."
          : "현재 GitHub 파일 저장 모드입니다. 저장한 콘텐츠는 배포 후 사이트에 반영됩니다."}
      </p>
      <nav className="mb-8 grid gap-3 sm:grid-cols-3" aria-label="관리자 주요 메뉴">
        <Link
          href="/admin/cyno-carousel"
          className="group rounded-2xl border border-accent/40 bg-accent/10 p-4 transition hover:border-accent hover:bg-accent/15"
        >
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-accent">Cyno studio</span>
          <span className="mt-2 block text-base font-bold">영화 캐러셀 제작실</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">영화 한 편을 고르면 작품 개요·줄거리 요약·핵심 내용·감상 포인트 5장을 만듭니다.</span>
          <span className="mt-3 block text-xs font-semibold text-accent group-hover:underline">제작실 열기 →</span>
        </Link>
        <Link href="/admin/movie" className="rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/50">
          <span className="block text-xs font-semibold text-muted">Cyno data</span>
          <span className="mt-2 block text-sm font-bold">영화 관리</span>
          <span className="mt-1 block text-xs text-muted">영화 추가·별점·왓챠 기록</span>
        </Link>
        <Link href="/admin/moments" className="rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/50">
          <span className="block text-xs font-semibold text-muted">Archive</span>
          <span className="mt-2 block text-sm font-bold">장면 관리</span>
          <span className="mt-1 block text-xs text-muted">문화 장면과 연결 기록</span>
        </Link>
      </nav>
      <AdminForm />

      <h2 className="mb-3 mt-16 text-lg font-bold">대량 작업 (Claude·ChatGPT)</h2>
      <BulkWork />

      <h2 className="mb-3 mt-16 text-lg font-bold">누락 항목 보정 (한 곡씩 · Gemini)</h2>
      <Backfill />

      <h2 className="mb-3 mt-16 text-lg font-bold">커버 검토 ({artworkless.length})</h2>
      <ArtworkReview items={artworkless} />

      <h2 className="mb-3 mt-16 text-lg font-bold">번역 형식 검사</h2>
      <Lint />

      <h2 className="mb-3 mt-16 text-lg font-bold">가사 정확성 검토</h2>
      <LyricsAudit />

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
