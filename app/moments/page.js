import Link from "next/link";
import { getAllMomentsRuntime } from "../../lib/moments";
import MomentCard from "../moment-card";

export const metadata = {
  title: "문화 장면 | Lyra.cyno",
  description: "노래와 영화가 같은 시간에 남긴 기억을 엮은 문화 자서전",
};
export const dynamic = "force-dynamic";

export default async function MomentsPage() {
  const moments = await getAllMomentsRuntime();
  const years = [...new Set(moments.map((moment) => moment.startDate.slice(0, 4)))];
  return (
    <div className="pb-12 pt-8">
      <header className="mb-14 max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-accent">Lyra × Cyno</p>
        <h1 className="text-3xl font-bold sm:text-4xl">문화 장면</h1>
        <p className="mt-4 leading-relaxed text-muted">노래와 영화가 같은 시기에 남긴 흔적. 작품의 목록이 아니라, 그 작품을 통해 다시 읽는 시간의 기록이다.</p>
      </header>
      {moments.length ? (
        <div className="space-y-14">
          {years.map((year) => <section key={year} className="grid gap-5 md:grid-cols-[100px_1fr]">
            <h2 className="pt-1 text-2xl font-light text-muted">{year}</h2>
            <div className="grid gap-4 sm:grid-cols-2">{moments.filter((moment) => moment.startDate.startsWith(year)).map((moment) => <MomentCard key={moment.slug} moment={moment} />)}</div>
          </section>)}
        </div>
      ) : (
        <div className=" border border-dashed border-line px-6 py-20 text-center">
          <p className="text-sm text-muted">아직 공개된 문화 장면이 없습니다.</p>
          <Link href="/archive" className="mt-4 inline-block text-sm text-accent">기존 아카이브 보기 →</Link>
        </div>
      )}
    </div>
  );
}
