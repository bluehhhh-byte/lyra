import Link from "next/link";
import { VALENCE_RANGE, valenceColor } from "../lib/keywords";

// 일자별 감정 변화 — mean valence per day as a line, each day a dot colored by
// its own valence. Server component, pure SVG (no chart lib). Days with no
// emotion yet (pre-backfill) break the line rather than dropping to zero.
//
// viewBox coordinates, CSS scales it to the container. Height fixed; width is
// arbitrary and the SVG stretches, so the x-spacing stays even.
export default function EmotionTimeline({ days, height = 150 }) {
  const pts = days.filter((d) => d.valence !== null);
  if (pts.length < 2) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
        감정 데이터가 이틀 이상 쌓이면 변화 곡선이 그려집니다.
      </p>
    );
  }

  const W = 720;
  const H = height;
  const padX = 24;
  const padY = 22;
  const [lo, hi] = VALENCE_RANGE;
  const x = (i) => padX + (i * (W - 2 * padX)) / (pts.length - 1);
  const y = (v) => padY + ((hi - v) / (hi - lo)) * (H - 2 * padY);
  const midY = y(0);

  // path across only the emotion-bearing days, in order
  const line = pts.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.valence).toFixed(1)}`).join(" ");
  const md = (day) => day.slice(5).replace("-", "/");

  return (
    <figure className="overflow-x-auto">
      {/* axis meaning as a caption, not in-chart text — the latter overlapped
          the first day's label */}
      <figcaption className="mb-1.5 flex items-center gap-3 font-mono text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: valenceColor(3) }} />
          밝은 감정
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: valenceColor(-3) }} />
          어두운 감정
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="일자별 감정 변화">
        {/* zero line — the 밝음/어두움 divide */}
        <line x1={padX} y1={midY} x2={W - padX} y2={midY} stroke="var(--color-line)" strokeWidth="1" strokeDasharray="3 4" />

        <path d={line} fill="none" stroke="var(--color-muted)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.5" />

        {pts.map((d, i) => (
          <g key={d.day}>
            <circle cx={x(i)} cy={y(d.valence)} r="5" fill={valenceColor(d.valence)} stroke="var(--color-bg)" strokeWidth="1.5">
              <title>{`${md(d.day)} · ${d.dominant || "감정 없음"} (${d.count}곡)`}</title>
            </circle>
            {/* label every point when few, every other when crowded */}
            {(pts.length <= 12 || i % 2 === 0) && (
              <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted" fontSize="8.5">
                {md(d.day)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}
