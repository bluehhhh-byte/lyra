"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { valenceColor } from "../../lib/keywords";
import EmotionTimeline from "../emotion-timeline";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const tally = (values) => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

function monthLabel(month) {
  const [year, value] = month.split("-");
  return `${year}년 ${Number(value)}월`;
}

function dayLabel(day) {
  const date = new Date(`${day}T12:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export default function DiaryMonth({ month, days, initialDay, previousMonth, nextMonth }) {
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const selected = days.find((day) => day.day === selectedDay) || days.at(-1);
  const byDate = useMemo(() => new Map(days.map((day) => [Number(day.day.slice(-2)), day])), [days]);
  const totalSongs = days.reduce((sum, day) => sum + day.count, 0);
  const emotions = tally(
    days.flatMap((day) => day.emotions.flatMap(([emotion, count]) => Array(count).fill(emotion)))
  );
  const keywords = tally(
    days.flatMap((day) => day.keywords.flatMap(([keyword, count]) => Array(count).fill(keyword)))
  );
  const artists = tally(days.flatMap((day) => day.songs.map((song) => song.artist)));
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstWeekday = new Date(`${month}-01T12:00:00+09:00`).getDay();
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const chooseDay = (day) => {
    setSelectedDay(day);
    const params = new URLSearchParams({ month, day });
    history.replaceState(null, "", `/diary?${params}`);
  };

  return (
    <>
      <nav className="mb-6 flex items-center justify-between border-y border-line py-3" aria-label="월 이동">
        {previousMonth ? (
          <Link href={`/diary?month=${previousMonth}`} className="text-sm text-muted hover:text-accent">
            ← {Number(previousMonth.slice(5))}월
          </Link>
        ) : <span />}
        <h2 className="text-base font-semibold">{monthLabel(month)}</h2>
        {nextMonth ? (
          <Link href={`/diary?month=${nextMonth}`} className="text-sm text-muted hover:text-accent">
            {Number(nextMonth.slice(5))}월 →
          </Link>
        ) : <span />}
      </nav>

      <section className="mb-10">
        <h2 className="sr-only">월간 요약</h2>
        <div className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
          <Summary label="기록" value={`${days.length}일`} />
          <Summary label="곡" value={`${totalSongs}곡`} />
          <Summary label="대표 감정" value={emotions[0]?.[0] || "—"} />
          <Summary label="자주 들은 가수" value={artists[0]?.[0] || "—"} />
        </div>
        <div className="mt-6">
          <EmotionTimeline days={days} height={130} />
        </div>
        {keywords.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted">이달의 키워드</span>
            {keywords.slice(0, 6).map(([keyword, count]) => (
              <Link
                key={keyword}
                href={`/?q=${encodeURIComponent(keyword)}`}
                className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
              >
                #{keyword}{count > 1 && <span className="ml-1 opacity-60">{count}</span>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold">감정 달력</h2>
        <div className="grid grid-cols-7 border-x border-t border-line">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="border-b border-line py-2 text-center text-[11px] text-muted">
              {weekday}
            </div>
          ))}
          {cells.map((value, index) => {
            const diaryDay = value ? byDate.get(value) : null;
            const active = diaryDay?.day === selected?.day;
            return (
              <div
                key={`${index}-${value || "blank"}`}
                className="aspect-square min-w-0 border-b border-line p-1 sm:p-2"
              >
                {value && (
                  <button
                    onClick={() => diaryDay && chooseDay(diaryDay.day)}
                    disabled={!diaryDay}
                    aria-pressed={active}
                    aria-label={diaryDay ? `${value}일, ${diaryDay.dominant || "감정 없음"}, ${diaryDay.count}곡` : `${value}일, 기록 없음`}
                    className={`flex h-full w-full flex-col items-center justify-center rounded transition ${
                      active ? "bg-surface ring-1 ring-accent" : diaryDay ? "hover:bg-surface" : "cursor-default"
                    }`}
                  >
                    <span className={`text-xs tabular-nums ${diaryDay ? "text-ink" : "text-muted/50"}`}>{value}</span>
                    {diaryDay && (
                      <>
                        <span
                          className="mt-1 h-2.5 w-2.5 rounded-full"
                          style={{ background: diaryDay.valence !== null ? valenceColor(diaryDay.valence) : "var(--color-line)" }}
                        />
                        <span className="mt-1 hidden max-w-full truncate px-1 text-[10px] text-muted sm:block">
                          {diaryDay.dominant || `${diaryDay.count}곡`}
                        </span>
                        <span className="mt-0.5 text-[9px] text-muted sm:hidden">{diaryDay.count}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {selected && <DayDetail day={selected} />}

      <section className="mt-14 border-t border-line pt-8">
        <h2 className="mb-3 text-sm font-semibold">이달의 기록</h2>
        <div className="divide-y divide-line border-y border-line">
          {[...days].reverse().map((day) => (
            <details key={day.day} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 py-3 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: day.valence !== null ? valenceColor(day.valence) : "var(--color-line)" }}
                />
                <span className="font-medium">{dayLabel(day.day)}</span>
                <span className="text-xs text-muted">{day.dominant || "감정 없음"} · {day.count}곡</span>
                <span className="ml-auto text-muted transition group-open:rotate-180">⌄</span>
              </summary>
              <div className="pb-4 pl-5">
                <SongList songs={day.songs} />
              </div>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

function Summary({ label, value }) {
  return (
    <div className="min-w-0 bg-bg px-3 py-4">
      <p className="truncate text-lg font-bold">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

function DayDetail({ day }) {
  return (
    <section aria-live="polite">
      <div className="mb-4 flex flex-wrap items-baseline gap-2">
        <h2 className="mr-1 text-xl font-bold">{dayLabel(day.day)}</h2>
        {day.dominant && (
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-bg">{day.dominant}</span>
        )}
        {day.emotions.slice(1).map(([emotion, count]) => (
          <span key={emotion} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
            {emotion}{count > 1 && <span className="ml-1 opacity-60">{count}</span>}
          </span>
        ))}
        <span className="text-xs text-muted">{day.count}곡</span>
      </div>
      {day.keywords.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {day.keywords.map(([keyword, count]) => (
            <Link
              key={keyword}
              href={`/?q=${encodeURIComponent(keyword)}`}
              className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
            >
              #{keyword}{count > 1 && <span className="ml-1 opacity-60">{count}</span>}
            </Link>
          ))}
        </div>
      )}
      <SongList songs={day.songs} />
    </section>
  );
}

function SongList({ songs }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {songs.map((song) => (
        <Link key={song.slug} href={`/songs/${song.slug}`} className="group flex min-w-0 items-center gap-3">
          <img
            src={song.artwork.replace("600x600bb", "100x100bb")}
            alt=""
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium group-hover:text-accent">{song.title}</span>
            <span className="block truncate text-xs text-muted">{song.artist}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
