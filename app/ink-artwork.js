"use client";

export function hashSlug(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function artworkFor(slug) {
  const rng = mulberry32(hashSlug(slug || "lyra"));
  const strokeCount = 3 + Math.floor(rng() * 4);
  const strokes = Array.from({ length: strokeCount }, (_, index) => {
    const startX = 8 + rng() * 22;
    const startY = 12 + rng() * 76;
    const endX = 70 + rng() * 24;
    const endY = 10 + rng() * 80;
    const bend = (rng() - 0.5) * 34;
    return {
      d: `M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${(32 + rng() * 12).toFixed(1)} ${(startY + bend).toFixed(1)}, ${(57 + rng() * 15).toFixed(1)} ${(endY - bend).toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`,
      width: (1.2 + rng() * 2.4).toFixed(1),
      opacity: (0.48 + index * 0.08).toFixed(2),
    };
  });
  return {
    strokes,
    dot: { x: 19 + rng() * 62, y: 19 + rng() * 62, radius: 3.2 + rng() * 2.6 },
  };
}

export default function InkArtwork({ slug, label = "", className = "aspect-square w-full" }) {
  const drawing = artworkFor(slug);
  return (
    <svg
      viewBox="0 0 100 100"
      className={`bg-surface text-ink ${className}`}
      role={label ? "img" : undefined}
      aria-label={label ? `${label} 잉크 아트워크` : undefined}
      aria-hidden={label ? undefined : true}
      fill="none"
    >
      <rect width="100" height="100" fill="var(--color-surface)" />
      {drawing.strokes.map((stroke, index) => (
        <path
          key={index}
          d={stroke.d}
          stroke="currentColor"
          strokeWidth={stroke.width}
          strokeLinecap="round"
          opacity={stroke.opacity}
        />
      ))}
      <circle
        cx={drawing.dot.x}
        cy={drawing.dot.y}
        r={drawing.dot.radius}
        fill="var(--color-accent)"
      />
      {/* TODO: draw-on을 더할 때 각 pathLength를 1로 두고 reduced-motion에서는
          stroke-dasharray를 적용하지 않는 정적 대체를 유지한다. */}
    </svg>
  );
}
