import Link from "next/link";
import { getDiary } from "../../lib/diary";
import DiaryMonth from "./diary-month";

export const metadata = {
  title: "키워드 일기 | Lyra",
  description: "월별로 돌아보는 가사 키워드와 감정의 흐름",
};

export default async function DiaryPage({ searchParams }) {
  const days = getDiary().filter((day) => day.dominant || day.keywords.length);

  if (days.length === 0) {
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

  const months = [...new Set(days.map((day) => day.day.slice(0, 7)))];
  const query = (await searchParams) || {};
  const month = months.includes(query.month) ? query.month : months.at(-1);
  const monthDays = days.filter((day) => day.day.startsWith(month));
  const initialDay = monthDays.some((day) => day.day === query.day)
    ? query.day
    : monthDays.at(-1)?.day;
  const monthIndex = months.indexOf(month);

  return (
    <>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">키워드 일기</h1>
          <p className="mt-1 text-sm text-muted">날짜별로 쌓인 가사 키워드와 감정</p>
        </div>
        <Link href="/stats" className="text-sm text-muted hover:text-accent">전체 흐름 →</Link>
      </div>

      <DiaryMonth
        month={month}
        days={monthDays}
        initialDay={initialDay}
        previousMonth={months[monthIndex - 1] || ""}
        nextMonth={months[monthIndex + 1] || ""}
      />
    </>
  );
}
