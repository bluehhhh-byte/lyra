// Same-origin proxy for TMDB poster images. TMDB's CDN serves images without an
// Access-Control-Allow-Origin header, so a crossOrigin="anonymous" canvas load
// fails and the movie share-card can't draw the poster. Streaming the bytes
// through our own origin sidesteps CORS entirely. Locked to TMDB hosts.
// Dynamic: it reads a query param (force-static would prerender it empty). The
// immutable Cache-Control below lets the CDN serve repeats without re-fetching.
export const dynamic = "force-dynamic";

const ALLOWED = /^https:\/\/image\.tmdb\.org\/t\/p\//;

export async function GET(req) {
  const url = new URL(req.url).searchParams.get("url") || "";
  if (!ALLOWED.test(url)) return new Response("bad url", { status: 400 });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return new Response("upstream", { status: 502 });
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("error", { status: 502 });
  }
}
