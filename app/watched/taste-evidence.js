import { countryDistribution, genreRatingCross } from "../../lib/watched";

function Meter({ value, max, tone = "bg-accent/70" }) {
  return (
    <div className="h-2.5 min-w-24 overflow-hidden rounded-full bg-surface" aria-hidden="true">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function GenreRatingCross({ movies }) {
  const result = genreRatingCross(movies);
  return (
    <section className="mb-12" aria-labelledby="genre-cross-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="genre-cross-title" className="text-lg font-bold">장르 × 별점</h2>
          <p className="mt-1 text-xs text-muted">편수와 평균 별점은 서로 다른 축입니다. 별점 판단은 {result.min}편 이상부터 합니다.</p>
        </div>
        {result.deferred > 0 && <p className="text-xs text-muted">표본 부족 장르 {result.deferred}개는 판단 유보</p>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="bg-surface/70 text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">장르</th>
              <th className="px-3 py-2 font-medium">관람 편수 축</th>
              <th className="px-3 py-2 font-medium">평균 별점 축</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {result.rows.map((row) => (
              <tr key={row.k}>
                <th className="px-3 py-2.5 font-medium">{row.k}</th>
                <td className="px-3 py-2.5">
                  <div className="grid grid-cols-[1fr_3rem] items-center gap-2">
                    <Meter value={row.n} max={result.maxCount} />
                    <span className="text-right tabular-nums text-muted">{row.n}편</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {row.deferred ? (
                    <span className="text-muted">판단 유보 · {row.n}편</span>
                  ) : (
                    <div className="grid grid-cols-[1fr_3.5rem] items-center gap-2">
                      <Meter value={row.avg} max={5} tone="bg-green-500/70" />
                      <span className="text-right tabular-nums">★{row.avg.toFixed(2)}</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CountryDistribution({ movies }) {
  const result = countryDistribution(movies);
  return (
    <section className="mb-12" aria-labelledby="country-distribution-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="country-distribution-title" className="text-lg font-bold">국가·지역 분포</h2>
          <p className="mt-1 text-xs text-muted">지도 없이 {result.total.toLocaleString("ko-KR")}편의 분류 전체를 셉니다.</p>
        </div>
        <p className="text-xs text-muted">미분류 {result.unclassified.toLocaleString("ko-KR")}편</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface/70 text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">국가·지역</th>
              <th className="px-4 py-2 text-right font-medium">편수</th>
              <th className="px-4 py-2 text-right font-medium">비중</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {result.rows.map((row) => (
              <tr key={row.country}>
                <th className="px-4 py-2.5 font-medium">{row.country}</th>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.count.toLocaleString("ko-KR")}편</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">{(row.share * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
