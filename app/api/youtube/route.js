import { NextResponse } from "next/server";

// YouTube killed listType=search embeds, so we resolve "artist title" to the
// first search result's videoId by scraping the results page (no API key).
// Cached a day per query — video rankings don't move fast enough to matter.
export const revalidate = 86400;

export async function GET(req) {
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 200);
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      {
        headers: { "Accept-Language": "en" },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 86400 },
      }
    );
    const html = await res.text();
    const id = html.match(/"videoId":"([\w-]{11})"/)?.[1] || null;
    return NextResponse.json(
      { id },
      { headers: { "Cache-Control": "public, s-maxage=86400" } }
    );
  } catch {
    return NextResponse.json({ id: null });
  }
}
