const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "기록 없음";

export default function AdminOverview({ overview }) {
  const deploy = overview.deployment;
  return (
    <section className="mb-8" aria-labelledby="admin-overview-title">
      <h2 id="admin-overview-title" className="sr-only">관리 현황</h2>
      {overview.contentFallback && (
        <div className="mb-3 rounded-xl border-2 border-red-500 bg-red-500/10 px-4 py-3 text-sm" role="alert">
          <p className="font-bold text-red-600 dark:text-red-400">DB 연결 실패 · 파일 백업으로 읽는 중</p>
          <p className="mt-1 text-xs text-muted">표시된 콘텐츠가 최신이 아닐 수 있으며, 저장은 실패할 수 있습니다.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatusCard label="곡" value={`${overview.songCount}곡`} />
        <StatusCard label="영화" value={`${overview.movieCount}편`} />
        <StatusCard
          label="결손"
          value={`${overview.songNeeds + overview.movieNeeds}건`}
          note={`곡 ${overview.songNeeds} · 영화 ${overview.movieNeeds}`}
          caution={overview.songNeeds + overview.movieNeeds > 0}
        />
        <StatusCard
          label="콘텐츠 저장소"
          value={overview.contentFallback ? "파일 폴백" : overview.contentStore === "neon" ? "Neon DB" : "GitHub 파일"}
          caution={overview.contentFallback}
        />
        <StatusCard
          label="마지막 배포"
          value={deploy?.status || "기록 없음"}
          note={deploy ? formatDate(deploy.updatedAt) : "관리자 배포 장부 기준"}
        />
      </div>
    </section>
  );
}

function StatusCard({ label, value, note = "", caution = false }) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${caution ? "border-amber-500/60 bg-amber-500/10" : "border-line bg-surface"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-[11px] leading-snug text-muted">{note}</p>}
    </div>
  );
}
