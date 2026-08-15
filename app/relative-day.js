"use client";
import { useEffect, useState } from "react";
import { kstDay } from "../lib/kst";

// "오늘 / 어제 / 8월 14일" — 정적 빌드는 날짜가 지나도 그대로라 서버에서 상대 표현을
// 계산하면 하루 뒤에 거짓말이 된다. 서버는 절대 날짜만 내보내고, 상대 표현은 브라우저의
// 지금(KST)으로 여기서 붙인다. JS가 없거나 첫 페인트에서는 절대 날짜가 그대로 보인다.
const abs = (day) => {
  const [, m, d] = day.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
};

export default function RelativeDay({ day }) {
  const [rel, setRel] = useState("");
  useEffect(() => {
    const today = kstDay(new Date().toISOString());
    const diff = Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${day}T00:00:00Z`)) / 86400000);
    setRel(diff === 0 ? "오늘" : diff === 1 ? "어제" : diff === 2 ? "그저께" : "");
  }, [day]);
  return (
    <>
      {rel && <span>{rel}의 기록 · </span>}
      <time dateTime={day}>{day.slice(0, 4)}년 {abs(day)}</time>
      {!rel && <span>의 기록</span>}
    </>
  );
}
