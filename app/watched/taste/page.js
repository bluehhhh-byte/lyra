import Link from "next/link";
import { getWatchedRuntime } from "../../../lib/watched";
import { aggregate, decadeOf, runtimeBucket } from "../../../lib/taste-core";
import { readRuntimeData } from "../../../lib/store";
import { getAllMoviesRuntime } from "../../../lib/movies";
import { themeCounts } from "../../../lib/themes";
import CoverImage from "../../cover-image";

export const metadata = {
  title: "취향 분석 | Syno.",
  description: "별점 매긴 영화들의 국가·장르·감독·배우·연대 취향",
};

const personLink = (name) => `/people/${encodeURIComponent(name)}`;

function Bar({ label, n, avg, max, mean, link }) {
  const delta = avg - mean;
  const labelEl = link ? (
    <Link href={link} className="w-28 shrink-0 truncate hover:text-accent sm:w-36">{label}</Link>
  ) : (
    <span className="w-28 shrink-0 truncate sm:w-36">{label}</span>
  );
  return (
    <div className="flex items-center gap-3 py-1 text-sm">
      {labelEl}
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

function CountSection({ title, rows, mean, link }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold text-muted">{title}</h2>
      <div className="divide-y divide-line/50">
        {rows.map((r) => (
          <Bar key={r.k} label={r.k} n={r.n} avg={r.avg} max={max} mean={mean} link={link?.(r.k)} />
        ))}
      </div>
    </section>
  );
}

// 편애/기피 — 평균 별점이 전체 평균에서 얼마나 벗어났나
function PrefSection({ title, high, low, mean, link }) {
  if (!high.length && !low.length) return null;
  const chip = (r, tone) => {
    const cls = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
      tone === "up"
        ? "border-green-500/40 text-green-400"
        : "border-red-500/40 text-red-400 dark:text-red-400"
    }`;
    const inner = (
      <>
        {r.k}
        <span className="tabular-nums opacity-70">★{r.avg.toFixed(2)} · {r.n}</span>
      </>
    );
    return link ? (
      <Link key={r.k} href={link(r.k)} className={`${cls} hover:brightness-125`}>{inner}</Link>
    ) : (
      <span key={r.k} className={cls}>{inner}</span>
    );
  };
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

function CuratedThemeEvidence({ movies }) {
  const themes = themeCounts(movies).slice(0, 5);
  if (!themes.length) return null;
  return (
    <section className="mb-12 rounded-2xl border border-line bg-surface/50 p-5 sm:p-7">
      <h2 className="text-sm font-semibold">주제로 다시 읽는 큐레이션 영화</h2>
      <p className="mt-1 text-xs text-muted">전체 별점 이력이 아니라 직접 감상을 남긴 {movies.length}편의 검수 주제입니다.</p>
      <div className="mt-5 space-y-5">
        {themes.map(([theme, count]) => {
          const examples = movies.filter((movie) => movie.themes.includes(theme)).slice(0, 4);
          return (
            <details key={theme} className="group border-b border-line pb-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm">
                <span className="font-semibold">{theme}</span>
                <span className="text-xs text-muted">{count}편 · 근거 보기</span>
              </summary>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {examples.map((movie) => (
                  <Link key={movie.slug} href={`/movies/${movie.slug}`} className="group/movie min-w-0">
                    <CoverImage src={movie.poster} alt="" label={movie.title} loading="lazy" className="aspect-[2/3] w-full rounded-lg object-cover" />
                    <p className="mt-2 truncate text-xs font-semibold group-hover/movie:text-accent">{movie.title_ko || movie.title}</p>
                    {movie.comment && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">{movie.comment}</p>}
                  </Link>
                ))}
              </div>
              <Link href={`/archive?theme=${encodeURIComponent(theme)}`} className="mt-4 inline-block text-xs text-accent hover:underline">
                {theme}의 영화 기록 모두 보기 →
              </Link>
            </details>
          );
        })}
      </div>
    </section>
  );
}

export default async function TastePage() {
  const rated = (await getWatchedRuntime()).filter((m) => m.rating != null);
  const [report, curatedMovies] = await Promise.all([
    readRuntimeData("taste-report.json", null),
    getAllMoviesRuntime(),
  ]);

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

      <p className="mb-10 max-w-2xl text-xs leading-relaxed text-muted/70">
        막대는 <b className="text-muted">관람 편수</b>, 오른쪽 별점은 그 그룹의 <b className="text-muted">평균 평점</b>.
        전체 평균보다 <span className="text-green-400">높으면 초록</span>,
        <span className="text-red-400"> 낮으면 빨강</span> — 많이 본 것과 좋아하는 것은 다르다.
      </p>

      <CuratedThemeEvidence movies={curatedMovies} />

      <CountSection title="국가별" rows={country.byCount} mean={mean} />
      <CountSection title="장르별" rows={genre.byCount} mean={mean} />
      <CountSection title="연대별" rows={decade.byCount} mean={mean} />
      <CountSection title="상영시간" rows={runtime.byCount} mean={mean} />
      <CountSection title="많이 본 감독" rows={director.byCount} mean={mean} link={personLink} />
      <CountSection title="많이 본 배우" rows={actor.byCount} mean={mean} link={personLink} />

      <hr className="my-12 border-line" />
      <h2 className="mb-6 text-lg font-bold">편애와 기피</h2>
      <PrefSection title="장르" high={genre.byAvg} low={genre.byLow} mean={mean} />
      <PrefSection title="국가" high={country.byAvg} low={country.byLow} mean={mean} />
      <PrefSection title="감독" high={director.byAvg} low={director.byLow} mean={mean} link={personLink} />
      <PrefSection title="연대" high={decade.byAvg} low={decade.byLow} mean={mean} />
    </>
  );
}
