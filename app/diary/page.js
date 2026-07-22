import Link from "next/link";
import { getDiary } from "../../lib/diary";
import { valenceColor } from "../../lib/keywords";
import EmotionTimeline from "../emotion-timeline";

export const metadata = {
  title: "키워드 일기 | Lyra",
  description: "기록한 날짜별 가사 키워드와 감정의 흐름",
};

// "7월 20일 (일)" in KST
function formatDay(day) {
  const d = new Date(`${day}T12:00:00+09:00`);
  if (isNaN(d)) return day;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

export default function DiaryPage() {
  const days = getDiary(); // chronological
  const withMood = days.filter((d) => d.emotion || d.keywords.length);

  if (withMood.length === 0) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-bold">키워드 일기</h1>
        <p className="py-20 text-center text-sm text-muted">
          아직 감정·키워드가 기록된 곡이 없습니다.
          <br />
          관리자에서 “키워드·감정 일괄 추출”을 실행하면 채워집니다.
        </p>
      </>
    );
  }

  const shown = [...withMood].reverse(); // 최신 날짜부터 읽는다
  const totalSongs = withMood.reduce((n, d) => n + d.count, 0);

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">키워드 일기</h1>
      <p className="mb-8 text-sm text-muted">
        {withMood.length}일 · {totalSongs}곡 — 그날 기록한 곡들의 가사 키워드와 감정
      </p>

      <div className="mb-12 rounded-2xl border border-line bg-surface/40 p-5">
        <EmotionTimeline days={days} height={160} />
      </div>

      <ol className="space-y-8 border-l border-line pl-5">
        {shown.map((d) => (
          <li key={d.day} className="relative">
            <span
              className="absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-bg"
              style={{ background: d.valence !== null ? valenceColor(d.valence) : "var(--color-line)" }}
            />
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold">{formatDay(d.day)}</h2>
              {d.dominant && (
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-bg">
                  {d.dominant}
                </span>
              )}
              {/* 하루 안에 감정이 여럿이면 나머지도 옅게 보여준다 */}
              {d.emotions.slice(1).map(([e, n]) => (
                <span key={e} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                  {e}
                  {n > 1 && <span className="ml-1 opacity-60">{n}</span>}
                </span>
              ))}
              <span className="text-xs text-muted">{d.count}곡</span>
            </div>

            {d.keywords.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {d.keywords.map(([w, n]) => (
                  <Link
                    key={w}
                    href={`/?q=${encodeURIComponent(w)}`}
                    className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted transition hover:border-accent hover:text-accent"
                  >
                    #{w}
                    {n > 1 && <span className="ml-1 opacity-60">{n}</span>}
                  </Link>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {d.songs.map((s) => (
                <Link key={s.slug} href={`/songs/${s.slug}`} className="group flex w-40 items-center gap-2.5">
                  <img
                    src={s.artwork.replace("600x600bb", "100x100bb")}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium group-hover:text-accent">
                      {s.title}
                    </span>
                    <span className="block truncate text-xs text-muted">{s.artist}</span>
                  </span>
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <Link href="/stats" className="mt-12 inline-block text-sm text-muted hover:text-accent">
        ← 통계로
      </Link>
    </>
  );
}
