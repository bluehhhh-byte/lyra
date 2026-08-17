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
};

export default nextConfig;
