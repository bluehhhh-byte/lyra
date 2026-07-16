// Shown during navigation to any route that fetches on the server. A skeleton
// of the home grid so a route change reads as "loading", not a blank flash.
export default function Loading() {
  return (
    <div
      className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4"
      role="status"
      aria-label="불러오는 중"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <div className="aspect-square w-full animate-pulse rounded-xl bg-surface" />
          <div className="mt-3 h-3.5 w-3/4 animate-pulse rounded bg-surface" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}
