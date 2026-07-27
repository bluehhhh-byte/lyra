import Link from "next/link";
import { buildArchive } from "../../lib/archive";
import { valenceColor } from "../../lib/keywords";

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
  const months = [...new Set(archive.map((entry) => entry.day.slice(0, 7)))];
  const requested = (await searchParams)?.month;
  const month = months.includes(requested) ? requested : months.at(-1);
  const entries = archive.filter((entry) => entry.day.startsWith(month)).reverse();
  const index = months.indexOf(month);
  const itemCount = entries.reduce((sum, entry) => sum + entry.items.length, 0);

  if (!month) return <p className="py-20 text-center text-sm text-muted">아직 기록이 없습니다.</p>;

  return (
    <>
      <header className="mb-8">
        <p className="mb-1 text-xs text-muted">음악과 영화가 만나는 날짜별 기록</p>
        <h1 className="text-2xl font-bold">문화 아카이브</h1>
      </header>

      <nav className="mb-8 flex items-center justify-between border-y border-line py-3" aria-label="월 이동">
        {months[index - 1] ? (
          <Link href={`/archive?month=${months[index - 1]}`} className="text-sm text-muted hover:text-accent">
            ← {Number(months[index - 1].slice(5))}월
          </Link>
        ) : <span />}
        <div className="text-center">
          <h2 className="text-base font-semibold">{monthLabel(month)}</h2>
          <p className="text-xs text-muted">{entries.length}일 · {itemCount}개 기록</p>
        </div>
        {months[index + 1] ? (
          <Link href={`/archive?month=${months[index + 1]}`} className="text-sm text-muted hover:text-accent">
            {Number(months[index + 1].slice(5))}월 →
          </Link>
        ) : <span />}
      </nav>

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
                  {[entry.songs && `음악 ${entry.songs}`, entry.movies && `영화 ${entry.movies}`]
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
