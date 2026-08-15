// Vercel Deploy Hook으로 직접 배포를 건다.
//
//   node scripts/deploy-hook.mjs                 (VERCEL_DEPLOY_HOOK 환경변수 사용)
//   node scripts/deploy-hook.mjs <hook-url>
//
// 왜 필요한가 — 평소에는 main에 push하면 Vercel이 GitHub webhook을 받아 알아서 배포한다.
// 그런데 GitHub가 계정의 push 이벤트 발화를 멈추면(남용 탐지로 계정이 제한되면 이렇게 된다)
// webhook도 Actions도 조용히 죽는다. 저장소 push는 계속 되기 때문에 원인을 찾기 어렵다.
// Deploy Hook은 GitHub를 거치지 않는 단순 HTTP 엔드포인트라 그 상황에서도 배포가 나간다.
//
// 훅 만들기: Vercel 프로젝트 → Settings → Git → Deploy Hooks → 이름과 브랜치(main) 지정.
// 나온 URL을 .env.local의 VERCEL_DEPLOY_HOOK에 넣어 두면 인자 없이 쓸 수 있다.
// URL 자체가 배포 권한이므로 커밋하지 않는다(.env*는 .gitignore에 있다).
import fs from "fs";

const fromEnvFile = () => {
  try {
    const m = fs.readFileSync(".env.local", "utf8").match(/^VERCEL_DEPLOY_HOOK=(.+)$/m);
    return m?.[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    return null;
  }
};

const url = process.argv[2] || process.env.VERCEL_DEPLOY_HOOK || fromEnvFile();
if (!url) {
  console.error("Deploy Hook URL이 없다. 인자로 넘기거나 .env.local에 VERCEL_DEPLOY_HOOK을 적어라.");
  console.error("Vercel → 프로젝트 → Settings → Git → Deploy Hooks에서 만든다.");
  process.exit(1);
}
if (!/^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\//.test(url)) {
  console.error("Vercel Deploy Hook URL이 아니다:", url.slice(0, 60));
  process.exit(1);
}

const res = await fetch(url, { method: "POST" });
const body = await res.text();
if (!res.ok) {
  console.error(`배포 요청 실패 ${res.status}: ${body.slice(0, 300)}`);
  process.exit(1);
}
let job;
try { job = JSON.parse(body).job; } catch { /* 응답 형식이 바뀌어도 성공은 성공이다 */ }
console.log(`배포를 걸었다${job?.id ? ` (job ${job.id})` : ""}. Vercel 대시보드에서 진행 상황을 볼 수 있다.`);
console.log("반영 확인: node scripts/verify-layout.mjs https://lyra-one-zeta.vercel.app");
