// 수동 생성 AI 리포트의 버전 이력.
//
// 최신 필드는 기존 화면·추천 프롬프트와의 호환성을 위해 루트에 그대로 두고,
// 생성 당시의 스냅샷은 history에 오래된 순서로 누적한다. 기존 단일 리포트도
// 첫 재생성 때 자동으로 첫 번째 이력으로 편입된다.
const snapshot = (report) => {
  if (!report?.text || !report?.at) return null;
  return {
    text: String(report.text),
    count: Number(report.count) || 0,
    ...(Number.isFinite(Number(report.mean)) ? { mean: Number(report.mean) } : {}),
    at: String(report.at),
  };
};

const sameVersion = (a, b) => a.at === b.at && a.text === b.text;

export function appendReportVersion(previous, next) {
  const versions = Array.isArray(previous?.history)
    ? previous.history.map(snapshot).filter(Boolean)
    : [];
  const previousSnapshot = snapshot(previous);
  if (previousSnapshot && !versions.some((version) => sameVersion(version, previousSnapshot))) {
    versions.push(previousSnapshot);
  }
  const nextSnapshot = snapshot(next);
  if (!nextSnapshot) throw new Error("저장할 AI 리포트 본문과 생성 시각이 필요합니다");
  versions.push(nextSnapshot);
  return { ...next, history: versions };
}

export function previousReportVersions(report) {
  const current = snapshot(report);
  if (!current || !Array.isArray(report?.history)) return [];
  const versions = report.history.map(snapshot).filter(Boolean);
  const currentIndex = versions.findLastIndex((version) => sameVersion(version, current));
  if (currentIndex >= 0) versions.splice(currentIndex, 1);
  return versions.reverse();
}
