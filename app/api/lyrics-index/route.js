import { getAllSongsRuntime } from "../../../lib/songs";

// Lyric search index, split out of the home payload so the initial render
// doesn't ship every song's full lyrics. browse.js fetches this lazily on the
// first search keystroke. Runtime storage is tag-cached, so a DB save can
// invalidate this response without rebuilding the application.
export const dynamic = "force-dynamic";

export async function GET() {
  const index = (await getAllSongsRuntime()).map((s) => ({
    slug: s.slug,
    lines: s.stanzas.flatMap((st) => st.lines.flatMap((l) => [l.en, l.ko])).filter(Boolean),
  }));
  return Response.json(index);
}
