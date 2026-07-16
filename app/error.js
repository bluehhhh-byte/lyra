"use client";
// Route-level error boundary — replaces the bare Next error overlay with
// something a reader can act on. `reset` re-renders the segment.
export default function Error({ error, reset }) {
  return (
    <div className="py-24 text-center">
      <p className="text-sm text-muted">문제가 생겼어요.</p>
      <p className="mt-1 text-xs text-muted/60">{error?.message || "알 수 없는 오류"}</p>
      <div className="mt-6 flex justify-center gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.98]"
        >
          다시 시도
        </button>
        <a
          href="/"
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-accent"
        >
          컬렉션으로
        </a>
      </div>
    </div>
  );
}
