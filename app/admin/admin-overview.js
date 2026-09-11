import Link from "next/link";
import NeedsList from "./needs-list";

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
      {/* 폴백 경고는 app/admin/layout.js의 배너가 맡는다. 여기에도 두면 /admin
          에서만 두 번 뜨고, 게다가 이건 서버 렌더 시점의 한 번뿐이라 화면을
          열어 둔 채 장애가 시작되면 끝까지 조용하다. 아래 StatusCard의
          "콘텐츠 저장소" 칸은 그대로 둔다 — 그건 경고가 아니라 현황이다. */}
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
      {/* 카드가 개수만 보여주면 "결손 3건"을 보고도 어느 곡인지 알 수 없어
          로컬에서 스크립트를 돌려야 했다. 여기서 바로 펼쳐 곡으로 건너간다. */}
      <NeedsList items={overview.needsList || []} truncated={overview.needsListTruncated || 0} />
      <div className="mt-3  border border-line bg-surface px-4 py-3">
        <h3 className="text-sm font-semibold">최근 콘텐츠 변경</h3>
        {overview.contentStore !== "neon" ? (
          <p className="mt-2 text-xs text-muted">파일 저장 모드에서는 DB 변경 시각을 제공하지 않습니다.</p>
        ) : overview.history.length ? (
          <ul className="mt-2 divide-y divide-line text-xs">
            {overview.history.map((item) => (
              <li key={`${item.kind}:${item.slug}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                <span className="border border-line px-1.5 py-0.5 text-[10px] text-muted">{item.kind === "movie" ? "영화" : "곡"}</span>
                <Link href={item.kind === "movie" ? `/movies/${item.slug}` : `/admin/edit/${item.slug}`} className="min-w-0 flex-1 truncate hover:text-accent">
                  {item.title}
                </Link>
                <span className="text-muted tabular-nums">r{item.revision} · {formatDate(item.updatedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted">최근 변경 기록을 불러오지 못했거나 아직 기록이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

function StatusCard({ label, value, note = "", caution = false }) {
  return (
    <div className={` border px-3 py-3 ${caution ? "border-warn/60 bg-warn/10" : "border-line bg-surface"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-[11px] leading-snug text-muted">{note}</p>}
    </div>
  );
}
