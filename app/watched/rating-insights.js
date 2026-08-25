import { ratingDistribution, yearlyRatingTrend } from "../../lib/watched";

const W = 720;
const H = 220;
const PAD_X = 34;
const PAD_Y = 24;

function RatingHistogram({ rows }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div>
      <h3 className="text-sm font-semibold">별점 분포</h3>
      <div className="mt-4 grid h-44 grid-cols-10 items-end gap-1.5" role="img" aria-label="0.5점부터 5점까지 별점 분포 히스토그램">
        {rows.map((row) => (
          <div key={row.rating} className="flex h-full min-w-0 flex-col justify-end gap-1 text-center">
            <span className="text-[10px] tabular-nums text-muted">{row.count}</span>
            <div className="mx-auto w-full max-w-9 rounded-t bg-accent/75" style={{ height: `${Math.max((row.count / max) * 100, row.count ? 3 : 0)}%` }} />
            <span className="text-[10px] tabular-nums text-muted">{row.rating}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function YearlyRatingLine({ rows }) {
  if (!rows.length) return null;
  const first = rows[0].year;
  const last = rows.at(-1).year;
  const span = Math.max(last - first, 1);
  const x = (year) => PAD_X + ((year - first) / span) * (W - PAD_X * 2);
  const y = (average) => PAD_Y + ((5 - average) / 4.5) * (H - PAD_Y * 2);
  const points = rows.map((row) => `${x(row.year).toFixed(1)},${y(row.average).toFixed(1)}`).join(" ");
  return (
    <div>
      <h3 className="text-sm font-semibold">작품 연도별 평균 별점</h3>
      <p className="mt-1 text-xs text-muted">관람일이 아닌 작품 공개연도 기준 · 점 위에 올리면 연도별 표본을 확인할 수 있습니다.</p>
      <svg className="mt-4 h-56 w-full overflow-visible" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${first}년부터 ${last}년까지 작품 연도별 평균 별점 선 그래프`}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <g key={rating}>
            <line x1={PAD_X} x2={W - PAD_X} y1={y(rating)} y2={y(rating)} className="stroke-line" strokeWidth="1" />
            <text x="0" y={y(rating) + 4} className="fill-muted text-[10px]">★{rating}</text>
          </g>
        ))}
        <polyline points={points} fill="none" className="stroke-accent" strokeWidth="2.5" strokeLinejoin="round" />
        {rows.map((row) => (
          <circle key={row.year} cx={x(row.year)} cy={y(row.average)} r="3" className="fill-accent">
            <title>{row.year}년 · 평균 ★{row.average.toFixed(2)} · {row.count}편</title>
          </circle>
        ))}
        <text x={PAD_X} y={H - 2} className="fill-muted text-[10px]">{first}</text>
        <text x={W - PAD_X} y={H - 2} textAnchor="end" className="fill-muted text-[10px]">{last}</text>
      </svg>
    </div>
  );
}

export default function RatingInsights({ movies }) {
  const distribution = ratingDistribution(movies);
  const trend = yearlyRatingTrend(movies);
  return (
    <section className="mb-12 rounded-2xl border border-line bg-surface/40 p-5 sm:p-7" aria-labelledby="rating-insights-title">
      <h2 id="rating-insights-title" className="text-lg font-bold">별점의 모양</h2>
      <p className="mt-1 text-xs text-muted">{movies.length.toLocaleString("ko-KR")}편의 평가를 같은 고정 축으로 계산했습니다.</p>
      <div className="mt-7 grid gap-10 lg:grid-cols-2">
        <RatingHistogram rows={distribution} />
        <YearlyRatingLine rows={trend} />
      </div>
    </section>
  );
}
