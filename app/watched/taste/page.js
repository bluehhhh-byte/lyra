import Link from "next/link";
import { getWatched } from "../../../lib/watched";

export const metadata = {
  title: "취향 분석 | Syno.",
  description: "별점 매긴 영화들의 국가·장르·감독·배우·연대 취향",
};

// 관람 편수와 선호(평균 별점)를 나눠 본다 — 많이 본 것 ≠ 좋아하는 것.
// 각 그룹의 평균 별점을 전체 평균과 비교해 "편애/기피"를 드러낸다.
// 표본이 적으면 평균이 요동치므로 min표본 이상만 순위에 올린다.
function aggregate(rated, keyFn, { min = 3, top = 8 } = {}) {
  const g = new Map();
  for (const m of rated) {
    for (const k of [].concat(keyFn(m)).filter(Boolean)) {
      if (!g.has(k)) g.set(k, { n: 0, sum: 0 });
      const e = g.get(k);
      e.n += 1;
      e.sum += m.rating;
    }
  }
  const rows = [...g.entries()].map(([k, e]) => ({ k, n: e.n, avg: e.sum / e.n }));
  return {
    byCount: [...rows].sort((a, b) => b.n - a.n).slice(0, top),
    byAvg: rows.filter((r) => r.n >= min).sort((a, b) => b.avg - a.avg).slice(0, top),
    byLow: rows.filter((r) => r.n >= min).sort((a, b) => a.avg - b.avg).slice(0, top),
  };
}

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

const decadeOf = (y) => (y ? `${Math.floor(Number(y) / 10) * 10}s` : "미상");
const runtimeBucket = (r) => {
  const n = Number(r);
  if (!n) return null;
  if (n < 90) return "~90분";
  if (n < 110) return "90–110분";
  if (n < 130) return "110–130분";
  if (n < 150) return "130–150분";
  return "150분+";
};

export default function TastePage() {
  const rated = getWatched().filter((m) => m.rating != null);

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
