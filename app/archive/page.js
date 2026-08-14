import Link from "next/link";
import { buildArchive, summarizeArchiveMonth } from "../../lib/archive";
import { valenceColor } from "../../lib/keywords";
import { CULTURAL_THEMES } from "../../lib/themes";

export const metadata = {
  title: "문화 아카이브 | Lyra",
  description: "같은 날 기록한 음악과 영화를 함께 보는 문화 일지",
};

const monthLabel = (month) => {
  const [year, value] = month.split("-");
  return `${year}년 ${Number(value)}월`;
};

const dayLabel = (day) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${day}T12:00:00+09:00`));

export default async function ArchivePage({ searchParams }) {
  const archive = buildArchive();
  const params = (await searchParams) || {};
  const theme = CULTURAL_THEMES.includes(params.theme) ? params.theme : "";
  const relevant = theme
    ? archive.filter((entry) => entry.items.some((item) => item.type === "movie" && item.themes?.includes(theme)))
    : archive;
  const months = [...new Set(relevant.map((entry) => entry.day.slice(0, 7)))];
  const requested = params.month;
  const month = months.includes(requested) ? requested : months.at(-1);
  const monthEntries = archive.filter((entry) => entry.day.startsWith(month)).reverse();
  const summary = summarizeArchiveMonth(monthEntries);
  const entries = theme
    ? monthEntries
        .map((entry) => ({ ...entry, items: entry.items.filter((item) => item.type === "movie" && item.themes?.includes(theme)) }))
        .filter((entry) => entry.items.length)
    : monthEntries;
  const index = months.indexOf(month);
  const itemCount = entries.reduce((sum, entry) => sum + entry.items.length, 0);
  const monthHref = (value) => `/archive?month=${value}${theme ? `&theme=${encodeURIComponent(theme)}` : ""}`;

  if (!month) return <p className="py-20 text-center text-sm text-muted">아직 기록이 없습니다.</p>;

  return (
    <>
      <header className="mb-8">
        <p className="mb-1 text-xs text-muted">음악과 영화가 만나는 날짜별 기록</p>
        <h1 className="text-2xl font-bold">문화 아카이브</h1>
      </header>

      <nav className="mb-8 flex items-center justify-between border-y border-line py-3" aria-label="월 이동">
        {months[index - 1] ? (
          <Link href={monthHref(months[index - 1])} className="text-sm text-muted hover:text-accent">
            ← {Number(months[index - 1].slice(5))}월
          </Link>
        ) : <span />}
        <div className="text-center">
          <h2 className="text-base font-semibold">{monthLabel(month)}</h2>
          <p className="text-xs text-muted">{entries.length}일 · {itemCount}개 기록</p>
        </div>
        {months[index + 1] ? (
          <Link href={monthHref(months[index + 1])} className="text-sm text-muted hover:text-accent">
            {Number(months[index + 1].slice(5))}월 →
          </Link>
        ) : <span />}
      </nav>

      {summary.text && !theme && (
        <section className="mb-8 rounded-2xl border border-line bg-surface px-5 py-5 sm:px-7">
          <p className="text-xs font-semibold text-accent">그때의 나 · {monthLabel(month)}</p>
          <p className="mt-2 max-w-3xl font-serif text-lg leading-8">{summary.text}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {summary.themes.slice(0, 4).map(([name, count]) => (
              <Link key={name} href={`/archive?month=${month}&theme=${encodeURIComponent(name)}`} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-accent">
                {name} · {count}편
              </Link>
            ))}
          </div>
        </section>
      )}

      {theme && (
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          <span><b>{theme}</b>을 다룬 영화 기록</span>
          <Link href={`/archive?month=${month}`} className="ml-auto text-xs text-accent hover:underline">전체 기록 보기</Link>
        </div>
      )}

      <ol className="divide-y divide-line border-y border-line">
        {entries.map((entry) => (
          <li key={entry.day}>
            <Link
              href={`/archive/${entry.day}`}
              className="group grid gap-5 py-7 sm:grid-cols-[180px_minmax(0,1fr)]"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: entry.valence === null
                        ? "var(--color-line)"
                        : valenceColor(entry.valence),
                    }}
                  />
                  <h2 className="font-semibold group-hover:text-accent">{dayLabel(entry.day)}</h2>
                </div>
                <p className="mt-1 pl-[18px] text-xs text-muted">
                    {[entry.items.filter((item) => item.type === "song").length && `음악 ${entry.items.filter((item) => item.type === "song").length}`, entry.items.filter((item) => item.type === "movie").length && `영화 ${entry.items.filter((item) => item.type === "movie").length}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {entry.dominant && <p className="mt-2 pl-[18px] text-xs text-muted">{entry.dominant}</p>}
              </div>
              <div className="flex min-w-0 gap-3 overflow-hidden">
                {entry.items.slice(0, 7).map((item) => (
                  <div key={`${item.type}-${item.slug}`} className="w-16 shrink-0 sm:w-20">
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      className={`w-full border border-line object-cover ${
                        item.type === "song" ? "aspect-square rounded" : "aspect-[2/3] rounded"
                      }`}
                    />
                    <p className="mt-1 truncate text-[10px] text-muted">{item.title}</p>
                  </div>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
