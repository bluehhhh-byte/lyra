import { previousReportVersions } from "../lib/report-history";

const generatedLabel = (at) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));

export default function ReportHistory({ report, unit }) {
  const versions = previousReportVersions(report);
  if (!versions.length) return null;

  return (
    <details className="mt-5 border-t border-line pt-4">
      <summary className="cursor-pointer text-xs font-semibold text-accent hover:underline">
        이전 AI 리포트 {versions.length}개 보기
      </summary>
      <ol className="mt-4 space-y-4">
        {versions.map((version) => (
          <li key={`${version.at}-${version.text}`} className="border border-line bg-bg/40 px-4 py-4">
            <p className="mb-3 text-[11px] text-muted">
              {generatedLabel(version.at)} · {version.count.toLocaleString("ko-KR")}{unit} 기준
              {Number.isFinite(version.mean) && ` · 평균 ★${version.mean.toFixed(2)}`}
            </p>
            <div className="space-y-3 text-sm leading-relaxed text-ink/90">
              {version.text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
