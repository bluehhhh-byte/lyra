export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse" role="status" aria-label="관리자 화면 불러오는 중">
      <div className="h-8 w-36 rounded bg-line" />
      <div className="mt-8 h-10 rounded-lg bg-line/80" />
      <div className="mt-3 h-32 rounded-xl bg-line/60" />
      <div className="mt-14 h-6 w-48 rounded bg-line" />
      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-16 rounded-lg border border-line bg-surface" />
        ))}
      </div>
      <span className="sr-only">관리자 데이터를 불러오고 있습니다.</span>
    </div>
  );
}
