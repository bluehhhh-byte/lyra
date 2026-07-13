"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// prev/next within the date-sorted collection, plus ←/→ keyboard shortcuts
// (desktop) and horizontal swipe (mobile).
export default function SongNav({ prev, next }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e) => {
      // ignore when typing in an input/textarea
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft" && prev) router.push(`/songs/${prev.slug}`);
      if (e.key === "ArrowRight" && next) router.push(`/songs/${next.slug}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  // swipe left → next, swipe right → prev. Requires a clearly horizontal gesture
  // (dx ≥ 60px and twice the vertical drift) so normal scrolling never triggers it.
  useEffect(() => {
    let sx = 0, sy = 0, tracking = false;
    const start = (e) => {
      tracking = e.touches.length === 1; // a second finger = pinch zoom, not a swipe
      if (tracking) ({ clientX: sx, clientY: sy } = e.touches[0]);
    };
    const end = (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(t.clientY - sy) * 2) return;
      if (dx < 0 && next) router.push(`/songs/${next.slug}`);
      if (dx > 0 && prev) router.push(`/songs/${prev.slug}`);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchend", end);
    };
  }, [prev, next, router]);

  return (
    <>
      <div className="mx-auto mt-16 flex max-w-2xl gap-3">
      {prev ? (
        <Link
          href={`/songs/${prev.slug}`}
          className="flex-1 rounded-lg border border-line bg-surface px-4 py-3 text-sm hover:border-accent"
        >
          <span className="text-xs text-muted">← 이전</span>
          <span className="mt-0.5 block truncate font-medium">{prev.title}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
      {next ? (
        <Link
          href={`/songs/${next.slug}`}
          className="flex-1 rounded-lg border border-line bg-surface px-4 py-3 text-right text-sm hover:border-accent"
        >
          <span className="text-xs text-muted">다음 →</span>
          <span className="mt-0.5 block truncate font-medium">{next.title}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
      </div>
      {/* the shortcuts above are undiscoverable without these hints */}
      <p className="mx-auto mt-3 hidden max-w-2xl text-center text-xs text-muted/60 sm:block">
        <kbd className="rounded border border-line px-1">←</kbd>{" "}
        <kbd className="rounded border border-line px-1">→</kbd> 키로 곡 이동
      </p>
      <p className="mx-auto mt-3 max-w-2xl text-center text-xs text-muted/60 sm:hidden">
        ↔ 좌우로 밀어 곡 이동
      </p>
    </>
  );
}
