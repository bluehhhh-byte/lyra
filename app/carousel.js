"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Ambient from "./ambient";

// "listening room" shelf — recent covers on a snap track; the leftmost snapped
// card is focused: it lights the section with its album colors
export default function Carousel({ songs }) {
  const trackRef = useRef(null);
  const [focus, setFocus] = useState(0);

  // nearest snap position ← uniform card width + gap; no IntersectionObserver needed
  const onScroll = () => {
    const t = trackRef.current;
    const card = t?.firstElementChild;
    if (!card) return;
    const w = card.offsetWidth + 20; // keep in sync with .car-track gap
    setFocus(Math.max(0, Math.min(songs.length - 1, Math.round(t.scrollLeft / w))));
  };

  const f = songs[focus] || songs[0];
  if (!f) return null;

  return (
    <section className="ambient-host relative isolate mb-14 overflow-hidden rounded-2xl border border-line">
      <Ambient artwork={f.artwork} slug={f.slug} fixed={false} />
      <div className="flex items-baseline justify-between px-6 pt-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
          최근 추가
        </h2>
        <p className="min-w-0 truncate pl-4 text-sm">
          <span className="font-semibold">{f.title}</span>
          <span className="text-muted"> — {f.artist}</span>
        </p>
      </div>
      <div ref={trackRef} onScroll={onScroll} className="car-track">
        {songs.map((s, i) => (
          <Link
            key={s.slug}
            href={`/songs/${s.slug}`}
            className={`car-card ${i === focus ? "is-focus" : ""}`}
          >
            <img
              src={s.artwork.replace("600x600bb", "300x300bb")}
              srcSet={`${s.artwork.replace("600x600bb", "300x300bb")} 1x, ${s.artwork} 2x`}
              alt={`${s.title} — ${s.artist}`}
              loading={i < 3 ? "eager" : "lazy"}
              decoding="async"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
