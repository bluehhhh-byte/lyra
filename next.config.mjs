import path from "path";
import { fileURLToPath } from "url";

// 상위 폴더에 다른 프로젝트의 package-lock.json이 있으면 Next가 workspace
// root를 잘못 추론해 "Cannot find module for page: /_document"로 빌드가
// 깨질 수 있다 — 루트를 이 프로젝트로 못박는다.
const nextConfig = {
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
