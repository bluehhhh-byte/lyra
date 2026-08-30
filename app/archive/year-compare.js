"use client";

import { useState } from "react";
import { YearComparison } from "./orbit";

export default function YearCompare({ stats, years }) {
  const [firstYear, setFirstYear] = useState(years.at(-2) || years.at(-1));
  const [secondYear, setSecondYear] = useState(years.at(-1));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3  border border-line bg-surface p-4">
        <label className="grid gap-1 text-xs text-muted">
          첫 번째 연도
          <select value={firstYear} onChange={(event) => setFirstYear(event.target.value)} className=" border border-line bg-bg px-3 py-2 text-sm text-ink">
            {years.map((value) => <option key={value} value={value}>{value}년</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted">
          두 번째 연도
          <select value={secondYear} onChange={(event) => setSecondYear(event.target.value)} className=" border border-line bg-bg px-3 py-2 text-sm text-ink">
            {years.map((value) => <option key={value} value={value}>{value}년</option>)}
          </select>
        </label>
      </div>
      <YearComparison stats={stats} firstYear={firstYear} secondYear={secondYear} />
    </>
  );
}
