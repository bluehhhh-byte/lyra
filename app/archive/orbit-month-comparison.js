"use client";

import { useMemo, useState } from "react";
import { emotionColor } from "../../lib/emotion-color";
import { EMOTION_PROFILE_AXES, emotionProfile, emotionProfileScores } from "../../lib/emotion-profile";

const monthLabel = (month) => `${Number(month.slice(5))}월`;

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
  const baseColor = emotionColor(base);
  const compareColor = emotionColor(compare);
  const axisTip = (axis, distance = radius) => {
    const angle = -Math.PI / 2 + (axis * Math.PI * 2) / 5;
    return { x: cx + Math.cos(angle) * distance, y: cy + Math.sin(angle) * distance, angle };
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${chartId}-title ${chartId}-desc`} className="h-auto w-full overflow-visible">
      <title id={`${chartId}-title`}>{`${monthLabel(base.month)}과 ${monthLabel(compare.month)} 정서 별 그래프 비교`}</title>
      <desc id={`${chartId}-desc`}>
        점선은 기준 월, 실선은 비교 월이다. 각 별의 색은 그 달의 대표 감정과 밝기, 에너지에 따라 달라진다. 위에서 시계방향으로 밝은 기운, 강한 에너지, 감정의 폭, 어두운 깊이, 잔잔한 여운을 비교한다.
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

      {EMOTION_PROFILE_AXES.map(({ label }, axis) => {
        const end = axisTip(axis);
        const mobileGap = [24, 15, 22, 22, 15][axis];
        const text = axisTip(axis, radius + (width < 500 ? mobileGap : 30));
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
        data-emotion-color={baseColor}
        points={starPoints(cx, cy, shapeProfiles[baseIndex], radius)}
        fill={baseColor} fillOpacity="0.1"
        stroke={baseColor} strokeWidth="3"
        strokeDasharray="9 6" strokeLinejoin="round"
      />
      <polygon
        data-series="compare"
        data-emotion-color={compareColor}
        points={starPoints(cx, cy, shapeProfiles[compareIndex], radius)}
        fill={compareColor} fillOpacity="0.18"
        stroke={compareColor} strokeWidth="4"
        strokeLinejoin="round"
      />
      {shapeProfiles[compareIndex].map((value, axis) => {
        const tip = axisTip(axis, radius * value);
        return <circle key={axis} cx={tip.x} cy={tip.y} r="4" fill={compareColor} />;
      })}
      <circle cx={cx} cy={cy} r="3" fill="var(--color-ink)" />
    </svg>
  );
}

function MonthPicker({ label, points, value, onChange, role }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {points.map((point) => {
          const selected = point.month === value;
          const color = emotionColor(point);
          return (
            <button
              key={point.month}
              type="button"
              onClick={() => onChange(point.month)}
              aria-pressed={selected}
              data-selection-role={role}
              style={selected ? { borderColor: color, backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)` } : undefined}
              className={`inline-flex min-h-9 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selected ? "font-semibold" : "border-line bg-surface text-muted hover:text-ink"}`}
            >
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              {monthLabel(point.month)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function MonthSummary({ title, point }) {
  const color = emotionColor(point);
  const scores = emotionProfileScores(point);
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ borderColor: `color-mix(in oklab, ${color} 55%, transparent)`, backgroundColor: `color-mix(in oklab, ${color} 7%, transparent)` }}>
      <div className="flex items-center justify-between gap-2">
        <strong className="inline-flex items-center gap-2 text-sm text-ink">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          {title} · {monthLabel(point.month)}
        </strong>
        <span className="truncate text-xs text-muted">{point.dominant || "대표 감정 없음"}</span>
      </div>
      <p className="mt-1 text-xs tabular-nums text-muted">
        다섯 지표는 모두 0~100 · 기록 {point.count}개
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {EMOTION_PROFILE_AXES.map((axis, index) => (
          <div key={axis.key} className="rounded-lg bg-surface/70 px-2 py-1.5 text-center">
            <dt className="text-[9px] text-muted">{axis.short}</dt>
            <dd className="mt-0.5 text-xs font-semibold tabular-nums text-ink">{Math.round(scores[index] * 100)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AxisGuide() {
  return (
    <div className="mt-3 grid gap-1.5 sm:grid-cols-5" aria-label="별 그래프 다섯 축 설명">
      {EMOTION_PROFILE_AXES.map((axis, index) => (
        <div key={axis.key} className="rounded-xl border border-line bg-surface px-3 py-2.5">
          <p className="text-xs font-semibold text-ink">{index + 1}. {axis.label}</p>
          <p className="mt-1 text-[10px] leading-4 text-muted">{axis.description}</p>
        </div>
      ))}
    </div>
  );
}

export function OrbitMonthComparison({ points, initialMonth }) {
  const initialIndex = Math.max(0, points.findIndex((point) => point.month === initialMonth));
  const [baseMonth, setBaseMonth] = useState(points[Math.max(0, initialIndex - 1)].month);
  const [compareMonth, setCompareMonth] = useState(points[initialIndex].month);
  const shapeProfiles = useMemo(() => points.map((point) => emotionProfile(point)), [points]);
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
        <MonthPicker label="기준 월 선택" points={points} value={baseMonth} onChange={setBaseMonth} role="base" />
        <MonthPicker label="비교 월 선택" points={points} value={compareMonth} onChange={setCompareMonth} role="compare" />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-live="polite">
        <MonthSummary title="기준" point={base} />
        <MonthSummary title="비교" point={compare} />
      </div>
      <AxisGuide />
    </div>
  );
}
