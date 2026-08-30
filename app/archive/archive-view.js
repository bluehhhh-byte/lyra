import Link from "next/link";
import { statYears, monthSeasonality, monthNarrative, yearNarrative, workLabel } from "../../lib/archive-stats";
import { archivePath } from "../../lib/archive-paths";
import { valenceColor } from "../../lib/keywords";
import CoverImage from "../cover-image";
import ArchiveCalendar from "./calendar";
import { InkUnderline } from "../ink-details";
import { EmotionOrbit, EmotionTrend, BioTimeline, EmotionComposition } from "./orbit";
import YearCompare from "./year-compare";
import { INSUFFICIENT_SAMPLE_LABEL } from "../../lib/emotion-model";

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
          className={`w-9 shrink-0  border border-line object-cover ${item.type === "song" ? "aspect-square" : "aspect-[2/3]"}`}
        />
        <span className="min-w-0 flex-1 text-sm leading-5">
          <span className="mr-1.5  border border-line px-1 text-[10px] text-muted align-[2px]">
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

export default function ArchiveView({ archive, stats, month, theme = "" }) {
  const years = statYears(stats);
  const allMonths = [...new Set(archive.map((entry) => entry.day.slice(0, 7)))];
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
  const monthHref = (value) => archivePath(value, theme);
  const year = month?.slice(0, 4);
  const yearStats = stats.filter((s) => s.month.startsWith(`${year}-`));
  const yearBio = yearNarrative(stats, year);
  const seasonal = monthSeasonality(stats);

  if (!month) return <p className="py-20 text-center text-sm text-muted">아직 기록이 없습니다.</p>;

  return (
    <>
      <header className="mb-8">
        <p className="mb-1 text-xs text-muted">시간에 따른 감정의 이동으로 읽는 음악·영화 기록</p>
        <div>
          <h1 className="text-2xl font-bold">문화 아카이브</h1>
          <InkUnderline className="mt-1 h-1.5 w-28" />
        </div>
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
        <section className="mb-8  border border-line bg-surface px-5 py-5 sm:px-7">
          <p className="text-xs font-semibold text-accent">그때의 기록 · {monthLabel(month)}</p>
          <p className="mt-2 max-w-3xl font-serif text-lg leading-8">{narrative}</p>
          {monthStat?.themes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {monthStat.themes.slice(0, 4).map(([name, count]) => (
                <Link key={name} href={archivePath(month, name)} className=" border border-line px-2.5 py-1 text-xs text-muted hover:text-accent">
                  {name} · {count}편
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {theme && (
        <div className="mb-8 flex items-center gap-3  border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          <span><b>{theme}</b>을 다룬 영화 기록</span>
          <Link href={archivePath(month)} className="ml-auto text-xs text-accent hover:underline">전체 기록 보기</Link>
        </div>
      )}

      {!theme && (
        <section className="mb-10 min-w-0" aria-labelledby="orbit-heading">
          <h2 id="orbit-heading" className="text-lg font-bold">{year}년의 정서 지도</h2>
          <p className="mb-4 mt-1 text-xs text-muted">
            두 달을 골라 밝은 기운·에너지·감정의 폭·어두운 깊이·잔잔한 여운을 비교한다.
          </p>
          {monthStat?.character && (
            <p className="mb-4 inline-flex  border border-line bg-surface px-3 py-1 text-xs text-muted">
              기록의 성격 · {monthStat.character}
            </p>
          )}
          <div className="mb-6 min-w-0 sm:hidden">
            <h3 className="mb-1 text-sm font-semibold">월별 추이</h3>
            <p className="mb-3 text-xs text-muted">먼저 시간 순서로 변화를 보고, 아래 지도에서 위치를 확인한다.</p>
            <EmotionTrend stats={yearStats} year={year} />
          </div>
          {/* 정서 지도는 페이지 전체 폭을 사용한다. 월 좌표 사이 거리를 넓히고
              1월부터 이어지는 애니메이션을 한 흐름으로 읽기 위해 옆 칸을 두지 않는다. */}
          <div className="min-w-0">
            <EmotionOrbit stats={yearStats} month={month} monthHref={monthHref} />
            {monthStat?.emotions.length > 0 && (
              <div className="mt-6 min-w-0 max-w-xl  border border-line bg-surface px-4 py-4 sm:px-5">
                <h3 className="text-sm font-semibold">{Number(month.slice(5))}월의 감정 구성</h3>
                <p className="mb-3 mt-0.5 text-xs text-muted">막대는 그달 기록 전체에서 차지하는 비율이다.</p>
                <EmotionComposition stat={monthStat} />
              </div>
            )}
          </div>
          {/* 같은 좌표를 시간축으로 편 그림. 지도는 "어디에 있었나"를, 이쪽은
              "언제 어떻게 움직였나"를 답한다 — 척도가 고정이라 지도에서는
              이동 폭이 작아 보이는데 여기서는 열두 칸으로 벌어진다 */}
          <div className="mt-8 hidden min-w-0 sm:block">
            <h3 className="mb-1 text-sm font-semibold">월별 추이</h3>
            <p className="mb-3 text-xs text-muted">지도의 점을 시간 순서로 편 것이다.</p>
            <EmotionTrend stats={yearStats} year={year} />
          </div>

          <div className="mt-8 min-w-0">
            <h3 className="mb-3 text-sm font-semibold">시간축 일대기</h3>
            <BioTimeline stats={yearStats} month={month} monthHref={monthHref} />
          </div>
          {yearBio && (
            <div className="mt-6  border border-line bg-surface px-5 py-5 sm:px-7">
              <p className="text-xs font-semibold text-accent">{year}년의 일대기</p>
              <p className="mt-2 max-w-3xl font-serif text-base leading-7">{yearBio}</p>
            </div>
          )}
        </section>
      )}

      {!theme && years.length > 1 && (
        <section className="mb-10 min-w-0" aria-labelledby="year-compare-heading">
          <h2 id="year-compare-heading" className="text-lg font-bold">연도 간 정서 비교</h2>
          <p className="mb-4 mt-1 text-xs text-muted">두 해의 같은 달을 동일한 고정 척도 위에 겹쳐 본다.</p>
          <YearCompare stats={stats} years={years} />
        </section>
      )}

      {!theme && (
        <section className="mb-10" aria-labelledby="seasonality-heading">
          <h2 id="seasonality-heading" className="text-lg font-bold">여러 해의 같은 달</h2>
          <p className="mb-4 mt-1 text-xs text-muted">같은 달이 3개 연도 이상 기록됐을 때만 계절적 경향을 읽는다.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {seasonal.map((row) => (
              <div key={row.monthNum} className=" border border-line bg-surface px-3 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="text-sm">{row.monthNum}월</strong>
                  <span className="text-[11px] text-muted">{row.years.length}개 연도</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted">{row.deferred ? INSUFFICIENT_SAMPLE_LABEL : row.type}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {entries.length === 0 && theme && (
        <p className="mb-10  border border-line px-4 py-6 text-center text-sm text-muted">
          {monthLabel(month)}에는 {theme}을 다룬 영화 기록이 없다.{" "}
          <Link href={archivePath(month)} className="text-accent hover:underline">이 달의 전체 기록 보기</Link>
        </p>
      )}

      <ol className="divide-y divide-line border-y border-line">
        {entries.map((entry) => (
          <li key={entry.day} className="grid min-w-0 gap-4 py-7 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 "
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
