// Song-shaped skeleton (hero + a few lyric lines) — the root grid skeleton would
// read wrong on a detail page.
export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중">
      <div className="mb-12 flex flex-col items-center gap-6 rounded-2xl border border-line bg-surface/50 px-6 py-12 sm:flex-row sm:items-end sm:px-10">
        <div className="h-40 w-40 shrink-0 animate-pulse rounded-xl bg-surface sm:h-48 sm:w-48" />
        <div className="w-full space-y-3">
          <div className="mx-auto h-8 w-2/3 animate-pulse rounded bg-surface sm:mx-0" />
          <div className="mx-auto h-4 w-1/2 animate-pulse rounded bg-surface sm:mx-0" />
        </div>
      </div>
      <div className="mx-auto max-w-2xl space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-4/5 animate-pulse rounded bg-surface" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-surface/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
