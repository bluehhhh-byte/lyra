import { getAllSongs } from "../lib/songs";
import { SITE_URL } from "../lib/site";

export default function sitemap() {
  const songs = getAllSongs().map((s) => ({
    url: `${SITE_URL}/songs/${encodeURIComponent(s.slug)}`,
    lastModified: s.date || undefined,
  }));
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/tags`, changeFrequency: "weekly", priority: 0.5 },
    ...songs,
  ];
}
