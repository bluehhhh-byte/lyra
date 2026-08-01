import Link from "next/link";
import { getWatched } from "../../../lib/watched";
import { aggregate, decadeOf, runtimeBucket } from "../../../lib/taste-core";
import { readData } from "../../../lib/store";

export const metadata = {
  title: "취향 분석 | Syno.",
  description: "별점 매긴 영화들의 국가·장르·감독·배우·연대 취향",
};

function Bar({ label, n, avg, max, mean }) {
  const delta = avg - mean;
  return (
    <div className="flex items-center gap-3 py-1 text-sm">
      <span className="w-28 shrink-0 truncate sm:w-36">{label}</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded bg-surface">
        <div className="h-full rounded bg-accent/70" style={{ width: `${(n / max) * 100}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{n}편</span>
      <span
        className={`w-16 shrink-0 text-right text-xs tabular-nums ${
          delta > 0.15 ? "text-green-400" : delta < -0.15 ? "text-red-400 dark:text-red-400" : "text-muted"
        }`}
      >
        ★{avg.toFixed(2)}
      </span>
    </div>
  );
}

function CountSection({ title, rows, mean }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold text-muted">{title}</h2>
      <div className="divide-y divide-line/50">
        {rows.map((r) => (
          <Bar key={r.k} label={r.k} n={r.n} avg={r.avg} max={max} mean={mean} />
        ))}
      </div>
    </section>
  );
}

// 편애/기피 — 평균 별점이 전체 평균에서 얼마나 벗어났나
function PrefSection({ title, high, low, mean }) {
  if (!high.length && !low.length) return null;
  const chip = (r, tone) => (
    <span
      key={r.k}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
        tone === "up"
          ? "border-green-500/40 text-green-400"
          : "border-red-500/40 text-red-400 dark:text-red-400"
      }`}
    >
      {r.k}
      <span className="tabular-nums opacity-70">
        ★{r.avg.toFixed(2)} · {r.n}
      </span>
    </span>
  );
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-sm font-semibold text-muted">{title}</h2>
      <p className="mb-3 text-xs text-muted/60">전체 평균 ★{mean.toFixed(2)} 대비 · 3편 이상만</p>
      {high.length > 0 && (
        <div className="mb-2">
          <p className="mb-1.5 text-xs text-green-400">편애 ↑</p>
          <div className="flex flex-wrap gap-1.5">{high.map((r) => chip(r, "up"))}</div>
        </div>
      )}
      {low.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-red-400">박한 편 ↓</p>
          <div className="flex flex-wrap gap-1.5">{low.map((r) => chip(r, "down"))}</div>
        </div>
      )}
    </section>
  );
}

export default function TastePage() {
  const rated = getWatched().filter((m) => m.rating != null);
  const report = readData("taste-report.json", null);
  const recs = readData("taste-recs.json", null);

  if (rated.length === 0) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-bold">취향 분석</h1>
        <div className="mt-8 rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          별점 데이터가 있어야 분석할 수 있습니다.
          <br />
          관리자 → 영화 관리 → 왓챠피디아 가져오기에서 별점을 채워주세요.
        </div>
      </>
    );
  }

  const mean = rated.reduce((n, m) => n + m.rating, 0) / rated.length;
  const country = aggregate(rated, (m) => m.country);
  const genre = aggregate(rated, (m) => m.genre);
  const director = aggregate(rated, (m) => m.director_ko || m.director, { min: 2, top: 10 });
  const actor = aggregate(rated, (m) => m.cast, { min: 3, top: 10 });
  const decade = aggregate(rated, (m) => decadeOf(m.year), { min: 3 });
  const runtime = aggregate(rated, (m) => runtimeBucket(m.runtime), { min: 3 });

  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">취향 분석</h1>
          <p className="mt-1 text-sm text-muted">
            평가한 {rated.length}편 · 평균 ★{mean.toFixed(2)}
          </p>
        </div>
        <Link href="/watched" className="text-sm text-accent hover:underline">
          ← 목록으로
        </Link>
      </div>

      {/* Gemini 리포트 — 관리자에서 생성해 data/taste-report.json에 저장한 것.
          별점이 바뀌면 다시 생성해야 최신이 된다(count로 신선도 힌트만 준다). */}
      {report?.text && (
        <div className="mb-10 rounded-2xl border border-line bg-surface/40 p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
              AI 리포트
            </span>
            {report.count && report.count !== rated.length && (
              <span className="text-xs text-muted/60">
                {report.count}편 기준 · 지금 {rated.length}편 (재생성 권장)
              </span>
            )}
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-ink/90">
            {report.text.split(/\n\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      )}

      {/* 추천 — 안 본 영화. 리포트 바로 아래, 취향 막대들 위에 둔다 */}
      {recs?.items?.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-1 text-sm font-semibold text-muted">이런 영화는 어떨까</h2>
          <p className="mb-4 text-xs text-muted/60">평가하지 않은 작품 중 취향에 맞춰 고른 {recs.items.length}편</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {recs.items.map((m) => (
              <a
                key={m.tmdbId}
                href={`https://www.themoviedb.org/movie/${m.tmdbId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  {m.poster ? (
                    <img
                      src={m.poster}
                      alt={m.title}
                      loading="lazy"
                      className="aspect-[2/3] w-full object-cover transition group-hover:opacity-90"
                    />
                  ) : (
                    <div className="flex aspect-[2/3] items-center justify-center p-2 text-center text-xs text-muted">
                      {m.title}
                    </div>
                  )}
                </div>
                <p className="mt-1.5 truncate text-xs font-medium group-hover:text-accent">
                  {m.title}
                  {m.year ? <span className="text-muted"> · {m.year}</span> : null}
                </p>
                {m.why && <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-muted/80">{m.why}</p>}
              </a>
            ))}
          </div>
        </section>
      )}

      <p className="mb-10 max-w-2xl text-xs leading-relaxed text-muted/70">
        막대는 <b className="text-muted">관람 편수</b>, 오른쪽 별점은 그 그룹의 <b className="text-muted">평균 평점</b>.
        전체 평균보다 <span className="text-green-400">높으면 초록</span>,
        <span className="text-red-400"> 낮으면 빨강</span> — 많이 본 것과 좋아하는 것은 다르다.
      </p>

      <CountSection title="국가별" rows={country.byCount} mean={mean} />
      <CountSection title="장르별" rows={genre.byCount} mean={mean} />
      <CountSection title="연대별" rows={decade.byCount} mean={mean} />
      <CountSection title="상영시간" rows={runtime.byCount} mean={mean} />
      <CountSection title="많이 본 감독" rows={director.byCount} mean={mean} />
      <CountSection title="많이 본 배우" rows={actor.byCount} mean={mean} />

      <hr className="my-12 border-line" />
      <h2 className="mb-6 text-lg font-bold">편애와 기피</h2>
      <PrefSection title="장르" high={genre.byAvg} low={genre.byLow} mean={mean} />
      <PrefSection title="국가" high={country.byAvg} low={country.byLow} mean={mean} />
      <PrefSection title="감독" high={director.byAvg} low={director.byLow} mean={mean} />
      <PrefSection title="연대" high={decade.byAvg} low={decade.byLow} mean={mean} />
    </>
  );
}
