import Link from "next/link";
import { getAllMoviesRuntime } from "../../../lib/movies";
import { getAllMomentsRuntime } from "../../../lib/moments";
import { getAllSongsRuntime } from "../../../lib/songs";
import { kstToday } from "../../../lib/kst";
import MomentForm from "./moment-form";

export const metadata = { title: "장면 관리 | Cyno" };
export const dynamic = "force-dynamic";

export default async function MomentAdminPage({ searchParams }) {
  const { edit = "" } = await searchParams;
  const [songs, movies, moments] = await Promise.all([
    getAllSongsRuntime(),
    getAllMoviesRuntime(),
    getAllMomentsRuntime({ includeDrafts: true }),
  ]);
  const selected = moments.find((moment) => moment.slug === edit) || null;
  const catalog = [
    ...songs.map((song) => ({ kind: "song", slug: song.slug, title: song.title, subtitle: song.artist })),
    ...movies.map((movie) => ({
      kind: "movie",
      slug: movie.slug,
      title: movie.title_ko || movie.title,
      subtitle: movie.director_ko || movie.director || "",
    })),
  ];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">문화 장면</h1>
        <Link href="/admin/movie" className="text-sm text-muted transition hover:text-accent">← Cyno 영화 관리</Link>
        <Link href="/moments" className="text-sm text-muted transition hover:text-accent">공개 화면 →</Link>
      </div>
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
        한 시기의 기억에 노래와 영화를 함께 연결합니다. 저장 즉시 공개 화면과 각 작품의 연결 기록에 반영됩니다.
      </p>
      <MomentForm key={selected?.slug || "new"} initialMoment={selected} catalog={catalog} today={kstToday()} />

      <section className="mt-16">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">기록된 장면 ({moments.length})</h2>
          {selected && <Link href="/admin/moments" className="text-xs text-accent">새 장면 작성</Link>}
        </div>
        {moments.length ? (
          <div className="divide-y divide-line border-y border-line">
            {moments.map((moment) => (
              <Link key={moment.slug} href={`/admin/moments?edit=${encodeURIComponent(moment.slug)}`} className="flex gap-4 py-4 hover:text-accent">
                <time className="w-24 shrink-0 text-xs text-muted">{moment.startDate}</time>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{moment.title}</span>
                <span className="text-xs text-muted">{moment.published ? "공개" : "초안"}</span>
              </Link>
            ))}
          </div>
        ) : <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">아직 기록된 장면이 없습니다.</p>}
      </section>
    </>
  );
}
