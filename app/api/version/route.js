// 지금 서빙 중인 빌드가 어느 커밋인지 알려준다.
//
// Deploy Hook으로 배포하면 job id만 돌아오고 진행 상태는 조회할 수 없다(그건 토큰이
// 있어야 한다). 그래서 관리자 화면이 "약 2분 뒤 반영"이라고만 말하고 끝났다 —
// 정말 반영됐는지는 사람이 새로고침해 봐야 알았다.
//
// 배포가 끝나면 새 빌드가 뜨고 이 값이 바뀐다. 그걸 지켜보면 토큰 없이도 완료를
// 정확히 알 수 있다. 공개 저장소의 커밋 해시라 숨길 것이 없다.
import { databaseContentEnabled, contentFallbackActive, cachePayloadProbe } from "../../../lib/content-db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      // Git 연동 배포는 VERCEL_GIT_COMMIT_SHA를 받지만 CLI 업로드 배포는 못 받는다.
      // 그 경우 배포 생성 시 직접 심은 LYRA_COMMIT_SHA가 대신 답한다. 로컬은 "dev".
      sha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.LYRA_COMMIT_SHA || "dev",
      // 같은 커밋을 다시 배포(Redeploy)해도 이 값은 달라진다
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || "",
      // 지금 무엇을 읽고 있는가. Neon 이관을 끝내고도 환경변수 값에 BOM이 붙어
      // 이틀 동안 파일을 읽고 있었는데, 어디에도 그 사실이 드러나지 않아 아무도
      // 몰랐다. 저장소 모드는 한 눈에 보여야 한다.
      contentStore: databaseContentEnabled() ? "neon" : "files",
      // DB가 대답하지 못해 파일 백업으로 내려앉았는가(최근 10분 내). 폴백은 사이트를
      // 살리지만 옛 데이터를 서빙한다 — 조용히 두면 "왜 새 곡이 안 보이지"로 헤맨다.
      contentFallback: contentFallbackActive(),
      // Data Cache 항목은 2MiB를 넘으면 예외 없이 조용히 저장되지 않는다. 그러면
      // 캐시가 도는 것처럼 보이면서 매 요청 Neon을 다시 읽고, 청구서는 전송량으로
      // 온다. 넘었는지 아닌지가 어디에도 안 보였으므로 여기서 내놓는다.
      // measured=false는 "안전"이 아니라 크기를 재지 못했다는 뜻이다.
      cachePayload: await cachePayloadProbe(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
