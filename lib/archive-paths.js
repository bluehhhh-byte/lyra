export function archiveMonths(archive) {
  return [...new Set(archive.map((entry) => entry.day.slice(0, 7)))];
}

export function archivePath(month, theme = "") {
  return `/archive/${month}${theme ? `/${encodeURIComponent(theme)}` : ""}`;
}

export function archiveThemeParams(archive, themes) {
  return archiveMonths(archive).flatMap((month) => themes.map((theme) => ({ month, theme })));
}

export function latestMonthByTheme(archive, themes) {
  return Object.fromEntries(themes.map((theme) => [
    theme,
    archive.filter((entry) => entry.items.some((item) => item.type === "movie" && item.themes?.includes(theme))).at(-1)?.day.slice(0, 7) || "",
  ]));
}
