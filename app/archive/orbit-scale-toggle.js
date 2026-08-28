"use client";

import { useState } from "react";

export default function OrbitScaleToggle({ full, focus }) {
  const [scale, setScale] = useState("focus");
  const focused = scale === "focus";

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line bg-surface p-1" role="group" aria-label="정서 지도 척도">
          <button
            type="button"
            aria-pressed={focused}
            onClick={() => setScale("focus")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              focused ? "bg-accent text-bg" : "text-muted hover:text-ink"
            }`}
          >
            움직임 확대
          </button>
          <button
            type="button"
            aria-pressed={!focused}
            onClick={() => setScale("full")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              focused ? "text-muted hover:text-ink" : "bg-accent text-bg"
            }`}
          >
            전체 척도
          </button>
        </div>
        <p className="text-[11px] text-muted" aria-live="polite">
          {focused ? "같은 해 안의 미세한 이동을 확대했다." : "모든 연도에 같은 −3~+3 척도를 적용했다."}
        </p>
      </div>
      <div hidden={!focused}>{focus}</div>
      <div hidden={focused}>{full}</div>
    </div>
  );
}
