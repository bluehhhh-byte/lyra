import Link from "next/link";
import { getAllMoviesRuntime } from "../../../lib/movies";
import MovieForm from "../movie-form";
import MovieTools from "../movie-tools";
import WatchaImport from "../watcha-import";
import DeployControl from "../deploy-control";
import { databaseContentEnabled } from "../../../lib/content-db";

export const metadata = { title: "Cyno 영화 관리 | Cyno" };
export const dynamic = "force-dynamic"; // auth-gated, never prerender

export default async function MovieAdminPage() {
  const contentInDatabase = databaseContentEnabled();
  const movies = await getAllMoviesRuntime();
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Cyno 영화 관리</h1>
        <Link href="/admin" className="text-sm text-muted transition hover:text-accent">
          ← Lyra 곡 관리
        </Link>
        <Link href="/admin/tools" className="text-sm text-muted transition hover:text-accent">
          → 관리 도구
        </Link>
        <div className="sm:ml-auto">
          <DeployControl contentInDatabase={contentInDatabase} />
        </div>
      </div>
      {!contentInDatabase && (
        <p className="mb-5 rounded-lg border border-line px-3 py-2 text-xs text-muted">
          현재 GitHub 파일 저장 모드입니다. 저장한 콘텐츠는 배포 후 사이트에 반영됩니다.
        </p>
      )}
      <nav className="mb-8 grid gap-3 sm:grid-cols-3" aria-label="Cyno 관리자 메뉴">
        <Link
          href="/admin/movie"
          aria-current="page"
          className="rounded-2xl border border-accent/40 bg-accent/10 p-4"
        >
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-accent">Cyno data</span>
          <span className="mt-2 block text-base font-bold">영화 관리</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">영화 추가·별점·왓챠 기록을 관리합니다.</span>
        </Link>
        <Link
          href="/admin/cyno-carousel"
          className="group rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/50"
        >
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted">Cyno studio</span>
          <span className="mt-2 block text-base font-bold">영화 캐러셀 제작실</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">영화 한 편을 5장의 작품 노트로 만듭니다.</span>
          <span className="mt-3 block text-xs font-semibold text-accent group-hover:underline">제작실 열기 →</span>
        </Link>
        <Link
          href="/admin/moments"
          className="rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/50"
        >
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted">Cyno archive</span>
          <span className="mt-2 block text-base font-bold">장면 관리</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">영화와 음악이 만나는 문화 장면을 기록합니다.</span>
        </Link>
      </nav>
      <MovieForm />

      <h2 className="mb-1 mt-16 text-lg font-bold">왓챠 별점 병합</h2>
      <p className="mb-3 text-xs text-muted">
        별점 목록 페이지에서 뽑은 JSON을 붙여넣으면 취향 분석·목록의 별점이 채워집니다
      </p>
      <WatchaImport />

      <h2 className="mb-3 mt-16 text-lg font-bold">등록된 작품 ({movies.length})</h2>
      <MovieTools
        movies={movies.map((m) => ({
          slug: m.slug,
          title: m.title_ko || m.title,
          director: m.director_ko || m.director,
          poster: m.poster,
          media: m.media || "movie",
          rating: m.rating,
          comment: m.comment || "",
        }))}
      />
    </>
  );
}
