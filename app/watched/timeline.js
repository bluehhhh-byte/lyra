import { watchedTimeline } from "../../lib/watched";

function Density({ rows, label }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted">{label}</h3>
      <div className="mt-3 flex min-h-24 items-end gap-px overflow-x-auto pb-2" aria-label={label}>
        {rows.map((row) => (
          <div key={row.period} className="group flex min-w-2 flex-1 flex-col items-center justify-end" title={`${row.period} · ${row.count}편`}>
            <span className="sr-only">{row.period} {row.count}편</span>
            <span className="w-full min-w-2  bg-accent/55 group-hover:bg-accent" style={{ height: `${Math.max(3, (row.count / max) * 80)}px` }} aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted"><span>{rows[0].period}</span><span>{rows.at(-1).period}</span></div>
    </div>
  );
}

export default function WatchedTimeline({ movies }) {
  const timeline = watchedTimeline(movies);
  return (
    <section className="mb-10  border border-line bg-surface/40 p-5 sm:p-7" aria-labelledby="watched-timeline-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="watched-timeline-title" className="text-lg font-bold">관람 연대기</h2>
          <p className="mt-1 text-xs text-muted">작품 연도와 실제 관람일을 섞지 않고 따로 보여줍니다.</p>
        </div>
        <p className="text-xs text-muted">관람일 누락 {timeline.missingDates.toLocaleString("ko-KR")}편</p>
      </div>
      <div className="mt-7 grid gap-8">
        <Density rows={timeline.releaseYears} label="작품 공개연도 밀도" />
        {timeline.viewingMonths.length ? (
          <Density rows={timeline.viewingMonths} label="실제 관람 월별 밀도" />
        ) : (
          <div className=" border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            원본에 관람 날짜가 없어 연·월별 관람 밀도를 계산할 수 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}
