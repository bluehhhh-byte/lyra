import { countryDistribution, genreRatingCross, rewatchGroups, runtimeInsights } from "../../lib/watched";
import { INSUFFICIENT_SAMPLE_LABEL } from "../../lib/emotion-model";

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
        {result.deferred > 0 && <p className="text-xs text-muted">표본 부족 장르 {result.deferred}개는 {INSUFFICIENT_SAMPLE_LABEL}</p>}
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
                    <span className="text-muted">{INSUFFICIENT_SAMPLE_LABEL} · {row.n}편</span>
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

export function RuntimeEvidence({ movies }) {
  const result = runtimeInsights(movies);
  const maxBucket = Math.max(...result.buckets.map((row) => row.count), 1);
  const maxPeriod = Math.max(...result.periods.map((row) => row.known), 1);
  return (
    <section className="mb-12 rounded-2xl border border-line bg-surface/40 p-5 sm:p-7" aria-labelledby="runtime-evidence-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="runtime-evidence-title" className="text-lg font-bold">러닝타임과 장편의 시기</h2>
          <p className="mt-1 text-xs text-muted">시기는 관람일이 아닌 작품 공개연도 5년 구간 기준입니다.</p>
        </div>
        <p className="text-xs text-muted">러닝타임 있음 {result.known.toLocaleString("ko-KR")}편 · 누락 {result.missing.toLocaleString("ko-KR")}편</p>
      </div>
      <div className="mt-7 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h3 className="text-sm font-semibold">러닝타임 분포</h3>
          <div className="mt-4 space-y-3">
            {result.buckets.map((row) => (
              <div key={row.bucket} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2 text-xs">
                <span>{row.bucket}</span>
                <Meter value={row.count} max={maxBucket} />
                <span className="text-right tabular-nums text-muted">{row.count}편</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{result.longMinutes}분 이상 장편의 작품 연도</h3>
          <p className="mt-1 text-xs text-muted">전체 막대는 러닝타임 확인 편수, 초록 막대는 그중 장편 {result.longCount}편입니다.</p>
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-2">
            {result.periods.map((row) => (
              <div key={row.start} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 text-xs">
                <span className="tabular-nums text-muted">{row.start}–{row.end}</span>
                <div className="relative h-3 overflow-hidden rounded-full bg-surface">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-accent/30" style={{ width: `${(row.known / maxPeriod) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-green-500/75" style={{ width: `${(row.long / maxPeriod) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums text-muted">{row.long}/{row.known}편</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function RewatchEvidence({ movies }) {
  const rows = rewatchGroups(movies);
  return (
    <section className="mb-12" aria-labelledby="rewatch-title">
      <h2 id="rewatch-title" className="text-lg font-bold">재관람 기록</h2>
      <p className="mt-1 text-xs text-muted">TMDB ID를 우선하고, 없으면 제목과 작품 연도로 같은 작품을 찾습니다.</p>
      {rows.length ? (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium">{row.title} {row.year && <span className="text-muted">({row.year})</span>}</span>
              <span className="text-xs text-muted">{row.count}회 · {row.ratings.map((rating) => `★${rating}`).join(" → ") || "별점 없음"}{row.ratingChanged ? " · 별점 변화" : ""}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">현재 데이터에는 재관람 기록이 없습니다.</p>
      )}
    </section>
  );
}
