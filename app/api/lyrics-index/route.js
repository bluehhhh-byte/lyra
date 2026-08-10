import { getAllSongs } from "../../../lib/songs";

// Lyric search index, split out of the home payload so the initial render
// doesn't ship every song's full lyrics. browse.js fetches this lazily on the
// first search keystroke. Songs change only on redeploy, so it's static and
// served from the CDN — one cached fetch per visitor who actually searches.
export const dynamic = "force-static";

export function GET() {
  const index = getAllSongs().map((s) => ({
    slug: s.slug,
    lines: s.stanzas.flatMap((st) => st.lines.flatMap((l) => [l.en, l.ko])).filter(Boolean),
  }));
  return Response.json(index);
}
