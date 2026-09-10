import Link from "next/link";

// 빈 상태 — 아직 기록이 없다는 사실을 알리되, 없다는 이유로 화면을 차지하지는
// 않는다. py-16~20의 점선 상자는 페이지 절반을 비워 두고 "고장"처럼 읽혔다.
// 점선 문법은 이 사이트의 어휘라 그대로 두고 높이만 한 줄로 접는다.
//
// note는 조건이 맞을 때만 붙는 보조 사실(예: "메타데이터는 1045편 준비됨")이라
// 본문과 같은 줄에 두지 않는다.
export default function EmptyState({ children, note = "", href = "", linkLabel = "", className = "" }) {
  return (
    <div className={`border border-dashed border-line px-4 py-3 text-sm text-muted ${className}`}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span>{children}</span>
        {href && (
          <Link href={href} className="text-accent hover:underline">
            {linkLabel || "보기 →"}
          </Link>
        )}
      </p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
