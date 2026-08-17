import Link from "next/link";
import { getAllMoviesRuntime } from "../../../lib/movies";
import MovieForm from "../movie-form";
import MovieTools from "../movie-tools";
import WatchaImport from "../watcha-import";
import DeployControl from "../deploy-control";
import { databaseContentEnabled } from "../../../lib/content-db";

export const metadata = { title: "Syno. 관리 | Lyra" };
export const dynamic = "force-dynamic"; // auth-gated, never prerender

export default async function MovieAdminPage() {
  const contentInDatabase = databaseContentEnabled();
  const movies = await getAllMoviesRuntime();
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">영화 관리</h1>
        <Link href="/admin" className="text-sm text-muted transition hover:text-accent">
          → 곡 관리로
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
