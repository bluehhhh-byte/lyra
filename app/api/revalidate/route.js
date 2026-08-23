import { revalidateTag, revalidatePath } from "next/cache";
import { timingSafeEqualString } from "../../../lib/admin/secret";

// 콘텐츠 캐시 무효화 전용 endpoint.
//
// 스크립트로 DB를 고치면 사이트는 옛 값을 계속 보여준다. Next 데이터 캐시는
// 배포로도 지워지지 않고 태그로만 지워지기 때문이다. 예전에는 migrate-content가
// ADMIN_PASSWORD로 로그인한 뒤 관리자 API를 호출해 이 일을 했다 — 캐시를 비우자고
// 비밀번호 전체 권한을 스크립트에 쥐여 주는 구조였고, 로그인 흐름이 바뀔 때마다 깨졌다.
//
// 여기서는 REVALIDATE_SECRET 하나만 확인한다. 이 키로 할 수 있는 일은 캐시 무효화뿐이다.
//
// same-origin은 신뢰 근거가 아니다 — Origin 헤더는 서버 대 서버 요청에서 임의로
// 붙일 수 있고, 스크립트는 애초에 브라우저가 아니다. secret만이 판단 근거다.
export const dynamic = "force-dynamic";

const CONTENT_TAGS = ["lyra-content", "lyra-songs", "lyra-movies", "lyra-data", "lyra-moments"];

const clean = (value) =>
  String(value ?? "").replace(/^﻿/, "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();

export async function POST(request) {
  const configured = clean(process.env.REVALIDATE_SECRET);
  if (!configured) {
    // 설정되지 않았다는 사실은 알려 주되, 어떤 값을 기대하는지는 말하지 않는다.
    return Response.json(
      { ok: false, error: "REVALIDATE_SECRET이 설정되지 않았습니다." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const presented = clean(
    request.headers.get("x-revalidate-secret") ||
      (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
  );
  if (!presented || !timingSafeEqualString(presented, configured)) {
    return Response.json(
      { ok: false, error: "인증 실패" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  for (const tag of CONTENT_TAGS) revalidateTag(tag);
  revalidatePath("/");
  return Response.json(
    { ok: true, tags: CONTENT_TAGS },
    { headers: { "Cache-Control": "no-store" } }
  );
}
