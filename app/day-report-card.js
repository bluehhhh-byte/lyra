import Link from "next/link";
import { workLabel } from "../lib/latest-day";
import { LatestDayScene } from "./fable-scenes";
import DayArtworkCaption from "./day-artwork-caption";

export default function DayReportCard({ insight }) {
  if (!insight?.text) return null;
  const works = [insight.repSong, insight.repMovie].filter(Boolean);

  return (
    <section className="mb-10 grid min-w-0 overflow-hidden border border-line bg-surface sm:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="px-5 py-5 sm:px-7 sm:py-7">
        <p className="text-xs font-semibold text-accent">이날의 리포트</p>
        <p className="mt-2 max-w-3xl font-serif text-base leading-7 sm:text-lg sm:leading-8">{insight.text}</p>
        {works.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {works.map((item) => (
              <Link
                key={`${item.kind}-${item.slug}`}
                href={item.kind === "music" ? `/songs/${item.slug}` : `/movies/${item.slug}`}
                className="text-accent hover:underline [overflow-wrap:anywhere]"
              >
                {workLabel(item)}
              </Link>
            ))}
          </p>
        )}
      </div>
      <figure className="flex min-w-0 flex-col border-t border-line bg-bg/[0.28] sm:border-l sm:border-t-0">
        <div className="relative min-h-52 flex-1 overflow-hidden">
          <LatestDayScene latest={insight} className="absolute inset-0 h-full w-full" />
        </div>
        <DayArtworkCaption latest={insight} />
      </figure>
    </section>
  );
}
