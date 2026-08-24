import Link from "next/link";
import { getAllMoviesRuntime } from "../../../lib/movies";
import { carouselMovie } from "../../../lib/movie-carousel";
import CarouselStudio from "./carousel-studio";

export const metadata = { title: "Cyno 캐러셀 제작실 | Cyno" };
export const dynamic = "force-dynamic";

export default async function CynoCarouselAdminPage() {
  const movies = (await getAllMoviesRuntime()).map(carouselMovie);
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Cyno admin</p>
          <h1 className="mt-1 text-2xl font-bold">Cyno 캐러셀 제작실</h1>
        </div>
        <Link href="/admin/movie" className="text-sm text-muted transition hover:text-accent sm:ml-auto">
          ← 영화 관리로
        </Link>
      </div>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted">
        한 편을 깊게 소개하는 5장 캐러셀이 기본입니다. 여러 작품을 묶을 때만 주제별 큐레이션을 사용하고,
        자동으로 고른 결과를 확인한 뒤 저장하세요.
      </p>
      <CarouselStudio movies={movies} />
    </>
  );
}
