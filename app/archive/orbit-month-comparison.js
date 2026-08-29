"use client";

import { useMemo, useState } from "react";

const AXES = ["각성", "밝기", "다양성", "기록 밀도", "전월 이동"];
const FLOOR = 0.25;

const monthLabel = (month) => `${Number(month.slice(5))}월`;
const fmt = (value) => (Math.round(value * 10) / 10).toFixed(1);

function normalize(values) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (Math.abs(high - low) < 0.0001) return values.map(() => 0.62);
  return values.map((value) => FLOOR + (1 - FLOOR) * Math.pow((value - low) / (high - low), 0.82));
}

function profiles(points) {
  const axes = [
    points.map((point) => point.center.a),
    points.map((point) => point.center.v),
    points.map((point) => point.entropy || 0),
    points.map((point) => Math.log1p(point.count)),
    points.map((point) => point.prev?.distance || 0),
  ].map(normalize);
  return points.map((_, index) => axes.map((axis) => axis[index]));
}

function starPoints(cx, cy, profile, radius) {
  return Array.from({ length: 10 }, (_, vertex) => {
    const outer = vertex % 2 === 0;
    const axis = Math.floor(vertex / 2);
    const length = outer ? radius * profile[axis] : radius * 0.22;
    const angle = -Math.PI / 2 + (vertex * Math.PI) / 5;
    return `${(cx + Math.cos(angle) * length).toFixed(2)},${(cy + Math.sin(angle) * length).toFixed(2)}`;
  }).join(" ");
}

function ComparisonChart({ points, shapeProfiles, baseIndex, compareIndex, variant, chartId }) {
  const { width, height, cx, cy, radius, fontSize } = variant;
  const base = points[baseIndex];
  const compare = points[compareIndex];
  const axisTip = (axis, distance = radius) => {
    const angle = -Math.PI / 2 + (axis * Math.PI * 2) / 5;
    return { x: cx + Math.cos(angle) * distance, y: cy + Math.sin(angle) * distance, angle };
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${chartId}-title ${chartId}-desc`} className="h-auto w-full overflow-visible">
      <title id={`${chartId}-title`}>{`${monthLabel(base.month)}과 ${monthLabel(compare.month)} 정서 별 그래프 비교`}</title>
      <desc id={`${chartId}-desc`}>
        보라색 점선은 기준 월, 강조색 실선은 비교 월이다. 위에서 시계방향으로 각성, 밝기, 다양성, 기록 밀도, 전월 이동을 비교한다.
      </desc>

      {[0.25, 0.5, 0.75, 1].map((level) => (
        <polygon
          key={level}
          points={starPoints(cx, cy, Array(5).fill(level), radius)}
          fill={level === 1 ? "var(--color-surface)" : "none"}
          fillOpacity={level === 1 ? 0.5 : 0}
          stroke="var(--color-line)"
          strokeWidth={level === 1 ? 1.2 : 0.8}
          strokeDasharray={level === 1 ? undefined : "3 5"}
        />
      ))}

      {AXES.map((label, axis) => {
        const end = axisTip(axis);
        const text = axisTip(axis, radius + (axis === 0 ? 25 : 30));
        const cos = Math.cos(text.angle);
        const anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
        const dy = axis === 0 ? -4 : axis === 2 || axis === 3 ? 9 : 5;
        return (
          <g key={label}>
            <line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="var(--color-line)" strokeWidth="0.9" />
            <text x={text.x} y={text.y + dy} textAnchor={anchor} fontSize={fontSize} fontWeight="600" fill="var(--color-muted)">
              {label}
            </text>
          </g>
        );
      })}

      <polygon
        data-series="base"
        points={starPoints(cx, cy, shapeProfiles[baseIndex], radius)}
        fill="oklch(0.65 0.15 295)" fillOpacity="0.08"
        stroke="oklch(0.7 0.15 295)" strokeWidth="3"
        strokeDasharray="9 6" strokeLinejoin="round"
      />
      <polygon
        data-series="compare"
        points={starPoints(cx, cy, shapeProfiles[compareIndex], radius)}
        fill="var(--color-accent)" fillOpacity="0.16"
        stroke="var(--color-accent)" strokeWidth="4"
        strokeLinejoin="round"
      />
      {shapeProfiles[compareIndex].map((value, axis) => {
        const tip = axisTip(axis, radius * value);
        return <circle key={axis} cx={tip.x} cy={tip.y} r="4" fill="var(--color-accent)" />;
      })}
      <circle cx={cx} cy={cy} r="3" fill="var(--color-ink)" />
    </svg>
  );
}

function MonthPicker({ label, points, value, onChange, tone }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {points.map((point) => {
          const selected = point.month === value;
          return (
            <button
              key={point.month}
              type="button"
              onClick={() => onChange(point.month)}
              aria-pressed={selected}
              className={`min-h-9 min-w-11 rounded-full border px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selected ? tone : "border-line bg-surface text-muted hover:border-accent/50 hover:text-ink"}`}
            >
              {monthLabel(point.month)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function MonthSummary({ title, point, className }) {
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm text-ink">{title} · {monthLabel(point.month)}</strong>
        <span className="truncate text-xs text-muted">{point.dominant || "대표 감정 없음"}</span>
      </div>
      <p className="mt-1 text-xs tabular-nums text-muted">
        밝기 {fmt(point.center.v)} · 각성 {fmt(point.center.a)} · 기록 {point.count}개
      </p>
    </div>
  );
}

export function OrbitMonthComparison({ points, initialMonth }) {
  const initialIndex = Math.max(0, points.findIndex((point) => point.month === initialMonth));
  const [baseMonth, setBaseMonth] = useState(points[Math.max(0, initialIndex - 1)].month);
  const [compareMonth, setCompareMonth] = useState(points[initialIndex].month);
  const shapeProfiles = useMemo(() => profiles(points), [points]);
  const baseIndex = points.findIndex((point) => point.month === baseMonth);
  const compareIndex = points.findIndex((point) => point.month === compareMonth);
  const base = points[baseIndex];
  const compare = points[compareIndex];

  const chartProps = { points, shapeProfiles, baseIndex, compareIndex };
  return (
    <div className="min-w-0">
      <div className="sm:hidden">
        <ComparisonChart {...chartProps} variant={{ width: 420, height: 450, cx: 210, cy: 222, radius: 128, fontSize: 13 }} chartId="month-compare-mobile" />
      </div>
      <div className="hidden sm:block">
        <ComparisonChart {...chartProps} variant={{ width: 900, height: 510, cx: 450, cy: 250, radius: 184, fontSize: 14 }} chartId="month-compare-desktop" />
      </div>

      <div className="mt-2 grid gap-4 rounded-2xl border border-line bg-surface/50 p-3 sm:grid-cols-2 sm:p-4">
        <MonthPicker label="기준 월 선택" points={points} value={baseMonth} onChange={setBaseMonth} tone="border-violet-400 bg-violet-500/15 text-violet-300" />
        <MonthPicker label="비교 월 선택" points={points} value={compareMonth} onChange={setCompareMonth} tone="border-accent bg-accent/15 text-accent" />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-live="polite">
        <MonthSummary title="기준" point={base} className="border-violet-400/45 bg-violet-500/5" />
        <MonthSummary title="비교" point={compare} className="border-accent/45 bg-accent/5" />
      </div>
    </div>
  );
}
