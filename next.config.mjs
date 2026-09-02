import path from "path";
import { fileURLToPath } from "url";

// 상위 폴더에 다른 프로젝트의 package-lock.json이 있으면 Next가 workspace
// root를 잘못 추론해 "Cannot find module for page: /_document"로 빌드가
// 깨질 수 있다 — 루트를 이 프로젝트로 못박는다.
const nextConfig = {
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // 이 라우트는 로컬 프로젝트를 읽지 않고 GitHub 소스 아카이브를 임시
  // 디렉터리에 내려받아 Vercel로 전달한다. 동적 fs 호출 때문에 NFT가 저장소
  // 전체와 빌드 중 삭제되는 export-detail.json까지 잘못 추적하지 않게 한다.
  outputFileTracingExcludes: {
    // Vercel의 pnpm 저장소에는 설치 중 잠깐 생겼다가 사라지는 SQLite
    // index.db-shm이 있다. NFT가 그 파일을 추적하면 패키징 시점의 lstat가
    // ENOENT로 끝나므로 런타임에 전혀 필요 없는 저장소 전체를 제외한다.
    "/*": [".pnpm-store/**/*"],
    "/api/admin/deploy": [
      ".git/**/*",
      ".next/**/*",
      ".env*",
      ".backfill/**/*",
      "data/**/*",
      "movies/**/*",
      "songs/**/*",
    ],
  },
  // 개인 사이트라 어떤 응답도 색인되지 않게 한다. app/layout.js의 metadata.robots는
  // HTML을 파싱한 봇에게만 닿지만 이 헤더는 모든 응답에 붙는다 — 이미지, JSON,
  // 라우트 핸들러 결과까지. robots.txt를 읽지 않는 크롤러에도 걸린다.
  // 운영 도메인을 lyracyno.vercel.app으로 옮겼다(2026-08-30). 옛 별칭 lyra-one-zeta는
  // 같은 배포를 그대로 서빙해 주소가 둘로 갈린다 — 공유된 링크와 캐시가 둘로 쪼개지지
  // 않게 옛 호스트로 온 요청을 영구 이동시킨다. 별칭 자체는 지우지 않는다(링크가 죽는다).
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "lyra-one-zeta.vercel.app" }],
        destination: "https://lyracyno.vercel.app/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
