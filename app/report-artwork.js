import { reportArtworkPlan } from "../lib/report-artwork";

const pointOnCircle = (circle, angle) => ({
  x: circle.cx + Math.cos(angle) * circle.radius,
  y: circle.cy + Math.sin(angle) * circle.radius,
});

function openCirclePath(circle) {
  const start = pointOnCircle(circle, circle.startAngle);
  const end = pointOnCircle(circle, circle.startAngle + circle.arc);
  return [
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${circle.radius.toFixed(2)} ${circle.radius.toFixed(2)} 0 ${circle.arc > Math.PI ? 1 : 0} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
  ].join(" ");
}

export default function ReportArtwork({ insights, className = "", label = "" }) {
  const plan = reportArtworkPlan(insights);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      data-report-artwork
      data-report-seed={plan.seed}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      fill="none"
    >
      <path
        d={openCirclePath(plan.ring)}
        stroke="var(--color-ink)"
        strokeWidth={plan.ring.width}
        strokeLinecap="round"
        opacity="0.58"
      />
      {plan.strokes.map((stroke, index) => (
        <path
          key={index}
          d={stroke.d}
          stroke={`var(--color-${stroke.tone})`}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          opacity={stroke.opacity}
        />
      ))}
      <circle cx={plan.dot.x} cy={plan.dot.y} r={plan.dot.radius} fill="var(--color-accent)" opacity="0.9" />
    </svg>
  );
}
