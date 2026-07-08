"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// prev/next within the date-sorted collection, plus ←/→ keyboard shortcuts.
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
      {/* the ←/→ shortcuts above are undiscoverable without this */}
      <p className="mx-auto mt-3 hidden max-w-2xl text-center text-xs text-muted/60 sm:block">
        <kbd className="rounded border border-line px-1">←</kbd>{" "}
        <kbd className="rounded border border-line px-1">→</kbd> 키로 곡 이동
      </p>
    </>
  );
}
