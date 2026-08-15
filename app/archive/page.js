import Link from "next/link";
import { buildArchive } from "../../lib/archive";
import { monthlyStats, statYears, monthNarrative, yearNarrative, workLabel } from "../../lib/archive-stats";
import { valenceColor } from "../../lib/keywords";
import { CULTURAL_THEMES } from "../../lib/themes";
import CoverImage from "../cover-image";
import ArchiveCalendar from "./calendar";
import { EmotionOrbit, BioTimeline, EmotionComposition } from "./orbit";

export const metadata = {
  title: "문화 아카이브 | Lyra",
  description: "같은 날 기록한 음악과 영화를 시간에 따른 감정의 이동으로 읽는 문화 일대기",
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

// 하루의 기록 한 줄 — 음악은 `아티스트 — 제목`, 영화는 `제목 — 감독`.
// 이름을 자르지 않고 여러 줄로 흐르게 둔다. 커버가 없어도 텍스트는 남는다.
function DayItem({ item }) {
  const href = item.type === "song" ? `/songs/${item.slug}` : `/movies/${item.slug}`;
  return (
    <li>
      <Link href={href} className="group flex items-start gap-2.5 py-1">
        {/* 커버가 없거나 외부 URL이 죽어도 제목·아티스트는 옆에 그대로 남는다 */}
        <CoverImage
          src={item.image}
          alt=""
          label={item.type === "song" ? "♪" : "▤"}
          loading="lazy"
          className={`w-9 shrink-0 rounded border border-line object-cover ${item.type === "song" ? "aspect-square" : "aspect-[2/3]"}`}
        />
        <span className="min-w-0 flex-1 text-sm leading-5">
          <span className="mr-1.5 rounded border border-line px-1 text-[10px] text-muted align-[2px]">
            {item.type === "song" ? "음악" : item.media === "tv" ? "TV" : "영화"}
          </span>
          {/* 긴 영문 아티스트명이 줄바꿈되지 않아 폭을 밀어내지 않게 — 자르지는 않는다 */}
          <span className="group-hover:text-accent [overflow-wrap:anywhere]">{workLabel(item)}</span>
        </span>
      </Link>
    </li>
  );
}

const VISIBLE_ITEMS = 8;

export default async function ArchivePage({ searchParams }) {
  const archive = buildArchive();
  const stats = monthlyStats(archive);
  const years = statYears(stats);
  const params = (await searchParams) || {};
  const theme = CULTURAL_THEMES.includes(params.theme) ? params.theme : "";
  const relevant = theme
    ? archive.filter((entry) => entry.items.some((item) => item.type === "movie" && item.themes?.includes(theme)))
    : archive;
  const allMonths = [...new Set(archive.map((entry) => entry.day.slice(0, 7)))];
  const months = [...new Set(relevant.map((entry) => entry.day.slice(0, 7)))];
  const requested = params.month;
  // theme이 있어도 달 선택 자체는 전체 기록 기준 — 주제가 없는 달은 빈 이유를 보여준다
  const month = allMonths.includes(requested) ? requested : (months.at(-1) ?? allMonths.at(-1));
  const monthEntries = archive.filter((entry) => entry.day.startsWith(month)).reverse();
  const monthStat = stats.find((s) => s.month === month);
  const narrative = monthNarrative(monthStat);
  const entries = theme
    ? monthEntries
        .map((entry) => ({ ...entry, items: entry.items.filter((item) => item.type === "movie" && item.themes?.includes(theme)) }))
        .filter((entry) => entry.items.length)
    : monthEntries;
  const index = allMonths.indexOf(month);
  const itemCount = entries.reduce((sum, entry) => sum + entry.items.length, 0);
  const monthHref = (value) => `/archive?month=${value}${theme ? `&theme=${encodeURIComponent(theme)}` : ""}`;
  const year = month?.slice(0, 4);
  const yearStats = stats.filter((s) => s.month.startsWith(`${year}-`));
  const yearBio = yearNarrative(stats, year);

  if (!month) return <p className="py-20 text-center text-sm text-muted">아직 기록이 없습니다.</p>;

  return (
    <>
      <header className="mb-8">
        <p className="mb-1 text-xs text-muted">시간에 따른 감정의 이동으로 읽는 음악·영화 기록</p>
        <h1 className="text-2xl font-bold">문화 아카이브</h1>
      </header>

      <ArchiveCalendar stats={stats} years={years} month={month} monthHref={monthHref} />

      <nav className="mb-8 flex items-center justify-between border-y border-line py-3" aria-label="월 이동">
        {allMonths[index - 1] ? (
          <Link href={monthHref(allMonths[index - 1])} className="text-sm text-muted hover:text-accent">
            ← {Number(allMonths[index - 1].slice(5))}월
          </Link>
        ) : <span />}
        <div className="text-center">
          <h2 className="text-base font-semibold">{monthLabel(month)}</h2>
          <p className="text-xs text-muted">{entries.length}일 · {itemCount}개 기록</p>
        </div>
        {allMonths[index + 1] ? (
          <Link href={monthHref(allMonths[index + 1])} className="text-sm text-muted hover:text-accent">
            {Number(allMonths[index + 1].slice(5))}월 →
          </Link>
        ) : <span />}
      </nav>

      {narrative && !theme && (
        <section className="mb-8 rounded-2xl border border-line bg-surface px-5 py-5 sm:px-7">
          <p className="text-xs font-semibold text-accent">그때의 기록 · {monthLabel(month)}</p>
          <p className="mt-2 max-w-3xl font-serif text-lg leading-8">{narrative}</p>
          {monthStat?.themes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {monthStat.themes.slice(0, 4).map(([name, count]) => (
                <Link key={name} href={`/archive?month=${month}&theme=${encodeURIComponent(name)}`} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-accent">
                  {name} · {count}편
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {theme && (
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          <span><b>{theme}</b>을 다룬 영화 기록</span>
          <Link href={`/archive?month=${month}`} className="ml-auto text-xs text-accent hover:underline">전체 기록 보기</Link>
        </div>
      )}

      {!theme && (
        <section className="mb-10 min-w-0" aria-labelledby="orbit-heading">
          <h2 id="orbit-heading" className="text-lg font-bold">{year}년의 감정 궤도</h2>
          <p className="mb-4 mt-1 text-xs text-muted">
            각 점은 그 달 음악 기록의 감정 좌표다. 점을 고르면 그 달로 이동한다.
          </p>
          <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
            <EmotionOrbit stats={yearStats} month={month} monthHref={monthHref} />
            {monthStat?.emotions.length > 0 && (
              <div className="min-w-0 max-w-full">
                <h3 className="mb-2 text-sm font-semibold">{Number(month.slice(5))}월의 감정 구성</h3>
                <EmotionComposition stat={monthStat} />
              </div>
            )}
          </div>
          <div className="mt-8 min-w-0">
            <h3 className="mb-3 text-sm font-semibold">시간축 일대기</h3>
            <BioTimeline stats={yearStats} month={month} monthHref={monthHref} />
          </div>
          {yearBio && (
            <div className="mt-6 rounded-2xl border border-line bg-surface px-5 py-5 sm:px-7">
              <p className="text-xs font-semibold text-accent">{year}년의 일대기</p>
              <p className="mt-2 max-w-3xl font-serif text-base leading-7">{yearBio}</p>
            </div>
          )}
        </section>
      )}

      {entries.length === 0 && theme && (
        <p className="mb-10 rounded-xl border border-line px-4 py-6 text-center text-sm text-muted">
          {monthLabel(month)}에는 {theme}을 다룬 영화 기록이 없다.{" "}
          <Link href={`/archive?month=${month}`} className="text-accent hover:underline">이 달의 전체 기록 보기</Link>
        </p>
      )}

      <ol className="divide-y divide-line border-y border-line">
        {entries.map((entry) => (
          <li key={entry.day} className="grid min-w-0 gap-4 py-7 sm:grid-cols-[180px_minmax(0,1fr)]">
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
                <Link href={`/archive/${entry.day}`} className="font-semibold hover:text-accent">
                  {dayLabel(entry.day)}
                </Link>
              </div>
              <p className="mt-1 pl-[18px] text-xs text-muted">
                {[entry.items.filter((item) => item.type === "song").length && `음악 ${entry.items.filter((item) => item.type === "song").length}`, entry.items.filter((item) => item.type === "movie").length && `영화 ${entry.items.filter((item) => item.type === "movie").length}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {entry.dominant && <p className="mt-2 pl-[18px] text-xs text-muted">{entry.dominant}</p>}
            </div>
            <div className="min-w-0">
              <ul className="grid min-w-0 gap-x-6 sm:grid-cols-2">
                {entry.items.slice(0, VISIBLE_ITEMS).map((item) => (
                  <DayItem key={`${item.type}-${item.slug}`} item={item} />
                ))}
              </ul>
              {entry.items.length > VISIBLE_ITEMS && (
                <details className="mt-1">
                  <summary className="cursor-pointer list-none text-xs text-accent hover:underline">
                    나머지 {entry.items.length - VISIBLE_ITEMS}개 펼치기
                  </summary>
                  <ul className="mt-1 grid min-w-0 gap-x-6 sm:grid-cols-2">
                    {entry.items.slice(VISIBLE_ITEMS).map((item) => (
                      <DayItem key={`${item.type}-${item.slug}`} item={item} />
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
