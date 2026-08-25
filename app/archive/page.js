import { Suspense } from "react";
import { buildArchiveRuntime } from "../../lib/archive";
import { archiveMonths, latestMonthByTheme } from "../../lib/archive-paths";
import { monthlyStats } from "../../lib/archive-stats";
import { CULTURAL_THEMES } from "../../lib/themes";
import ArchiveView from "./archive-view";
import LegacyArchiveRedirect from "./legacy-redirect";

export const metadata = {
  title: "문화 아카이브 | Lyra",
  description: "같은 날 기록한 음악과 영화를 시간에 따른 감정의 이동으로 읽는 문화 일대기",
};

export const revalidate = 21600;

export default async function ArchivePage() {
  const archive = await buildArchiveRuntime();
  const months = archiveMonths(archive);
  const month = months.at(-1);
  if (!month) return <p className="py-20 text-center text-sm text-muted">아직 기록이 없습니다.</p>;

  return (
    <>
      <Suspense fallback={null}>
        <LegacyArchiveRedirect
          months={months}
          themes={CULTURAL_THEMES}
          latestByTheme={latestMonthByTheme(archive, CULTURAL_THEMES)}
        />
      </Suspense>
      <ArchiveView archive={archive} stats={monthlyStats(archive)} month={month} />
    </>
  );
}
