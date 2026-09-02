import { isTrustedArtworkUrl } from "../../../lib/artwork-source.js";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPE = /^image\/(?:avif|gif|jpe?g|png|webp)$/i;

const errorResponse = (message, status) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request) {
  const source = new URL(request.url).searchParams.get("url") || "";
  if (!isTrustedArtworkUrl(source)) return errorResponse("허용되지 않은 커버 주소입니다.", 400);

  let upstream;
  try {
    upstream = await fetch(source, {
      redirect: "follow",
      headers: { "User-Agent": "LyraCarouselArtwork/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return errorResponse("커버 이미지를 불러오지 못했습니다.", 502);
  }

  const type = (upstream.headers.get("content-type") || "").split(";")[0].trim();
  const declaredSize = Number(upstream.headers.get("content-length") || 0);
  if ((upstream.url && !isTrustedArtworkUrl(upstream.url)) || !upstream.ok || !IMAGE_TYPE.test(type)) {
    await upstream.body?.cancel();
    return errorResponse("올바른 커버 이미지 응답이 아닙니다.", 502);
  }
  if (declaredSize > MAX_IMAGE_BYTES) {
    await upstream.body?.cancel();
    return errorResponse("커버 이미지가 너무 큽니다.", 413);
  }

  const bytes = await upstream.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES)
    return errorResponse("커버 이미지 크기가 올바르지 않습니다.", bytes.byteLength ? 413 : 502);

  return new Response(bytes, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(bytes.byteLength),
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
