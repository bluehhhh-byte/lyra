import { NextResponse } from "next/server";

// YouTube killed listType=search embeds, so we resolve "artist title" to the
// first search result's videoId by scraping the results page (no API key).
//
// Caching is CDN-only (Cache-Control), applied ONLY to successful lookups.
// The previous version cached the fetch itself (next revalidate) — one
// transient YouTube block wrote { id: null } into the data cache and that
// song's embed then stayed broken until the entry expired.
export const dynamic = "force-dynamic";

export async function GET(req) {
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 200);
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  let id = null;
  // two attempts — YouTube intermittently serves an empty shell under burst;
  // a short pause and one retry rides out most of those
  for (let attempt = 0; attempt < 2 && !id; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 700));
    try {
      const res = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
        {
          headers: { "Accept-Language": "en" },
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        }
      );
      const html = await res.text();
      id = html.match(/"videoId":"([\w-]{11})"/)?.[1] || null;
    } catch {}
  }
  return NextResponse.json(
    { id },
    {
      headers: {
        "Cache-Control": id
          ? "public, s-maxage=86400, stale-while-revalidate=604800"
          : "no-store",
      },
    }
  );
}
