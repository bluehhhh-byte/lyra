import Link from "next/link";
import { buildArchive } from "../../lib/archive";
import { buildRecap } from "../../lib/recap";
import { valenceColor } from "../../lib/keywords";
import { readData } from "../../lib/store";
import RecapShare from "./recap-share";

export const metadata = {
  title: "문화 결산 | Lyra",
  description: "월간·연간 음악과 영화 기록 결산",
};

const periodLabel = (period) => {
  const [year, month] = period.split("-");
  return month ? `${year}년 ${Number(month)}월` : `${year}년`;
};

export default async function RecapPage({ searchParams }) {
  const archive = buildArchive();
  const months = [...new Set(archive.map((entry) => entry.day.slice(0, 7)))];
  const years = [...new Set(archive.map((entry) => entry.day.slice(0, 4)))];
  const requested = (await searchParams)?.period;
  const periods = [...years, ...months];
  const period = periods.includes(requested) ? requested : months.at(-1);
  const recap = buildRecap(archive, period);

  if (!period) return <p className="py-20 text-center text-sm text-muted">결산할 기록이 없습니다.</p>;

  // 월간 편집본 재료 — 지난 기간과의 변화 + 다음 발견 경로
  const list = period.includes("-") ? months : years;
  const prevPeriod = list[list.indexOf(period) - 1] || null;
  const prevRecap = prevPeriod ? buildRecap(archive, prevPeriod) : null;
  // '처음 등장'은 직전 기간이 아니라 그 이전 전체 기록 기준 — 진짜 첫 등장만
  const seenArtists = new Set(
    archive.filter((e) => e.day.slice(0, period.length) < period).flatMap((e) => e.items)
      .filter((i) => i.type === "song").map((i) => i.subtitle)
  );
  const newArtists = recap.artists.map(([a]) => a).filter((a) => a && !seenArtists.has(a));

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs text-muted">음악과 영화로 돌아보는 시간</p>
          <h1 className="text-3xl font-bold">{periodLabel(period)} 결산</h1>
        </div>
        <RecapShare recap={serializeRecap(recap)} label={periodLabel(period)} />
      </header>

      <nav className="mb-10 flex flex-wrap gap-2 border-y border-line py-3">
        {years.map((value) => (
          <Link key={value} href={`/recap?period=${value}`} className={`rounded-full border px-3 py-1 text-xs ${period === value ? "border-accent bg-accent text-bg" : "border-line text-muted hover:text-accent"}`}>
            {value}년
          </Link>
        ))}
        <span className="mx-1 w-px bg-line" />
        {months.map((value) => (
          <Link key={value} href={`/recap?period=${value}`} className={`rounded-full border px-3 py-1 text-xs ${period === value ? "border-accent bg-accent text-bg" : "border-line text-muted hover:text-accent"}`}>
            {Number(value.slice(5))}월
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        <Metric value={recap.days.length} label="기록한 날" />
        <Metric value={recap.songs.length} label="음악" />
        <Metric value={recap.movies.length} label="영화·드라마" />
        <Metric value={recap.emotions[0]?.[0] || "—"} label="대표 감정" />
      </section>

      <section className="my-14 grid gap-12 sm:grid-cols-2">
        <Rank title="많이 들은 가수" rows={recap.artists.slice(0, 5)} suffix="곡" />
        <Rank title="자주 등장한 키워드" rows={recap.keywords.slice(0, 8)} prefix="#" />
        <Rank title="감정" rows={recap.emotions.slice(0, 6)} suffix="곡" />
        <div>
          <h2 className="mb-4 text-sm font-semibold">이 기간의 온도</h2>
          <div className="flex items-center gap-3">
            <span
              className="h-4 w-4 rounded-full"
              style={{ background: recap.averageValence === null ? "var(--color-line)" : valenceColor(recap.averageValence) }}
            />
            <p className="text-sm text-muted">
              {recap.averageValence === null ? "감정 데이터 없음" : recap.averageValence > 0.5 ? "밝은 감정이 더 많았던 기간" : recap.averageValence < -0.5 ? "어두운 감정이 더 많았던 기간" : "밝음과 어두움이 고르게 섞인 기간"}
            </p>
          </div>
          {recap.topMovie && (
            <Link href={`/movies/${recap.topMovie.slug}`} className="mt-6 flex items-center gap-3 border-t border-line pt-4 group">
              <img src={recap.topMovie.image} alt="" className="h-20 w-14 rounded object-cover" />
              <span>
                <span className="block text-xs text-muted">가장 높은 별점</span>
                <span className="block font-semibold group-hover:text-accent">{recap.topMovie.title}</span>
                <span className="text-xs text-accent">★ {recap.topMovie.rating}</span>
              </span>
            </Link>
          )}
        </div>
      </section>

      {/* 월간 편집본 — 지난 기간과 무엇이 달라졌는지, 다음엔 어디로 가는지 */}
      {(prevRecap || newArtists.length > 0) && (
        <section className="mb-14 rounded-xl border border-line bg-surface/50 px-5 py-5">
          <h2 className="mb-3 text-sm font-semibold">이번 기간의 변화</h2>
          <div className="space-y-2 text-sm text-muted">
            {prevRecap && prevRecap.emotions[0] && recap.emotions[0] && (
              <p>
                대표 감정: <span className="text-ink">{prevRecap.emotions[0][0]}</span> →{" "}
                <span className="font-semibold text-ink">{recap.emotions[0][0]}</span>
                {prevRecap.averageValence !== null && recap.averageValence !== null && (
                  <span className="ml-2 text-xs">
                    ({recap.averageValence > prevRecap.averageValence + 0.3
                      ? "밝아짐"
                      : recap.averageValence < prevRecap.averageValence - 0.3
                        ? "어두워짐"
                        : "온도 비슷"})
                  </span>
                )}
              </p>
            )}
            {newArtists.length > 0 && (
              <p>
                처음 등장한 가수: <span className="text-ink">{newArtists.slice(0, 6).join(", ")}</span>
                {newArtists.length > 6 && ` 외 ${newArtists.length - 6}팀`}
              </p>
            )}
            <p>
              <Link href="/songs/thread" className="text-accent hover:underline">
                기록의 흐름 보기 →
              </Link>
            </p>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-sm font-semibold">기록의 표지</h2>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {recap.items.slice(0, 14).map((item) => (
            <Link key={`${item.type}-${item.slug}`} href={item.type === "song" ? `/songs/${item.slug}` : `/movies/${item.slug}`} className="w-24 shrink-0 group">
              <img src={item.image} alt="" className={`w-full border border-line object-cover ${item.type === "song" ? "aspect-square rounded" : "aspect-[2/3] rounded"}`} />
              <p className="mt-1 truncate text-xs text-muted group-hover:text-accent">{item.title}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function Metric({ value, label }) {
  return <div className="bg-bg px-4 py-5"><p className="truncate text-2xl font-bold">{value}</p><p className="text-xs text-muted">{label}</p></div>;
}

function Rank({ title, rows, prefix = "", suffix = "" }) {
  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      <ol className="space-y-2">
        {rows.map(([label, count], index) => (
          <li key={label} className="flex items-baseline gap-3 border-b border-line pb-2 text-sm">
            <span className="w-5 font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 truncate">{prefix}{label}</span>
            <span className="text-xs text-muted">{count}{suffix}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function serializeRecap(recap) {
  return {
    period: recap.period,
    days: recap.days.length,
    songs: recap.songs.length,
    movies: recap.movies.length,
    emotion: recap.emotions[0]?.[0] || "",
    artists: recap.artists.slice(0, 3),
    keywords: recap.keywords.slice(0, 5),
    topMovie: recap.topMovie ? { title: recap.topMovie.title, rating: recap.topMovie.rating } : null,
  };
}
