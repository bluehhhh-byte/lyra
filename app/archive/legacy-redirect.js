"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { archivePath } from "../../lib/archive-paths";

export default function LegacyArchiveRedirect({ months, latestByTheme, themes }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const requestedMonth = searchParams.get("month");
    const requestedTheme = searchParams.get("theme");
    if (!requestedMonth && !requestedTheme) return;

    const theme = themes.includes(requestedTheme) ? requestedTheme : "";
    const month = months.includes(requestedMonth)
      ? requestedMonth
      : (theme && latestByTheme[theme]) || months.at(-1);
    if (month) router.replace(archivePath(month, theme));
  }, [latestByTheme, months, router, searchParams, themes]);

  return null;
}
