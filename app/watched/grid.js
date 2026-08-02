"use client";
import { useMemo, useState } from "react";

// 별점 분포 막대 + 포스터 그리드. 막대를 누르면 그 별점만 필터, 다시 누르면 해제.
// 서버 페이지에서 정렬된 rated 배열을 받는다.
export default function WatchedGrid({ rated }) {
  const [sel, setSel] = useState(null); // 선택된 별점 (null = 전체)

  const dist = useMemo(() => {
    const m = new Map();
    for (const x of rated) m.set(x.rating, (m.get(x.rating) || 0) + 1);
    return m;
  }, [rated]);
  const max = Math.max(...dist.values(), 1);

  const shown = sel == null ? rated : rated.filter((m) => m.rating === sel);

  return (
    <>
      <div className="mb-3 flex items-end gap-1.5">
        {Array.from({ length: 10 }, (_, i) => +(5 - i * 0.5).toFixed(1)).map((s) => {
          const n = dist.get(s) || 0;
          const active = sel === s;
          return (
            <button
              key={s}
              onClick={() => setSel(active ? null : s)}
              disabled={!n}
              aria-pressed={active}
              className="flex flex-1 flex-col items-center gap-1 disabled:cursor-default"
              title={n ? `★${s} ${n}편` : `★${s} 없음`}
            >
              <span className="text-[10px] tabular-nums text-muted">{n || ""}</span>
              <div
                className={`w-full rounded-t transition-colors ${
                  active ? "bg-accent" : n ? "bg-accent/50 hover:bg-accent/80" : "bg-line"
                }`}
                style={{ height: `${Math.max(2, (n / max) * 80)}px` }}
              />
              <span className={`text-[10px] tabular-nums ${active ? "font-bold text-accent" : "text-muted"}`}>
                {s}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-8 h-4 text-xs text-muted">
        {sel != null && (
          <button onClick={() => setSel(null)} className="text-accent hover:underline">
            ★{sel} {shown.length}편 · 전체 보기 ✕
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
        {shown.map((m) => (
          <div key={m.code} className="group">
            <div className="relative overflow-hidden rounded-lg border border-line bg-surface">
              {m.poster ? (
                <img
                  src={m.poster}
                  alt={m.title_ko || m.title}
                  loading="lazy"
                  className="aspect-[2/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center text-xs text-muted">
                  {m.title_ko || m.title}
                </div>
              )}
              <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">
                ★{m.rating}
              </span>
            </div>
            <p className="mt-1.5 truncate text-xs font-medium">{m.title_ko || m.title}</p>
            <p className="truncate text-[11px] text-muted">
              {[m.country, m.year].filter(Boolean).join(" · ")}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
