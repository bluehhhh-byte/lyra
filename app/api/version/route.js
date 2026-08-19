// 지금 서빙 중인 빌드가 어느 커밋인지 알려준다.
//
// Deploy Hook으로 배포하면 job id만 돌아오고 진행 상태는 조회할 수 없다(그건 토큰이
// 있어야 한다). 그래서 관리자 화면이 "약 2분 뒤 반영"이라고만 말하고 끝났다 —
// 정말 반영됐는지는 사람이 새로고침해 봐야 알았다.
//
// 배포가 끝나면 새 빌드가 뜨고 이 값이 바뀐다. 그걸 지켜보면 토큰 없이도 완료를
// 정확히 알 수 있다. 공개 저장소의 커밋 해시라 숨길 것이 없다.
import { databaseContentEnabled } from "../../../lib/content-db";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      // Vercel이 빌드할 때 넣어 준다. 로컬에서는 없으므로 "dev"로 둔다.
      sha: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
      // 같은 커밋을 다시 배포(Redeploy)해도 이 값은 달라진다
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || "",
      // 지금 무엇을 읽고 있는가. Neon 이관을 끝내고도 환경변수 값에 BOM이 붙어
      // 이틀 동안 파일을 읽고 있었는데, 어디에도 그 사실이 드러나지 않아 아무도
      // 몰랐다. 저장소 모드는 한 눈에 보여야 한다.
      contentStore: databaseContentEnabled() ? "neon" : "files",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
