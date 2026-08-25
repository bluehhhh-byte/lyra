import { notFound } from "next/navigation";
import { buildArchiveRuntime } from "../../../../lib/archive";
import { archiveMonths, archiveThemeParams } from "../../../../lib/archive-paths";
import { monthlyStats } from "../../../../lib/archive-stats";
import { CULTURAL_THEMES } from "../../../../lib/themes";
import ArchiveView from "../../archive-view";

export const revalidate = 21600;

export async function generateStaticParams() {
  return archiveThemeParams(await buildArchiveRuntime(), CULTURAL_THEMES)
    .map(({ month, theme }) => ({ day: month, theme }));
}

export default async function ArchiveThemePage({ params }) {
  const { day: month, theme: encodedTheme } = await params;
  const theme = decodeURIComponent(encodedTheme);
  const archive = await buildArchiveRuntime();
  if (!archiveMonths(archive).includes(month) || !CULTURAL_THEMES.includes(theme)) notFound();
  return <ArchiveView archive={archive} stats={monthlyStats(archive)} month={month} theme={theme} />;
}
