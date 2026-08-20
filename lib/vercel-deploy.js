import { deployGitHubSnapshot } from "./vercel-source-deploy.js";

const API = "https://api.vercel.com";

const SETUP_HINT =
  "모바일 배포에는 프로젝트 전용 LYRA_VERCEL_TOKEN과 GITHUB_TOKEN이 필요합니다";

function config(env) {
  const token = env.LYRA_VERCEL_TOKEN;
  const teamId = env.LYRA_VERCEL_TEAM_ID || env.VERCEL_TEAM_ID;
  const projectId = env.LYRA_VERCEL_PROJECT_ID || env.VERCEL_PROJECT_ID;
  const [org, repo] = String(env.GITHUB_REPO || "").split("/");
  const ref = env.GITHUB_BRANCH || "main";
  const name = env.LYRA_VERCEL_PROJECT_NAME || "lyra";
  const githubToken = env.GITHUB_TOKEN;

  const missing = [
    !token && "LYRA_VERCEL_TOKEN",
    !teamId && "LYRA_VERCEL_TEAM_ID",
    !projectId && "LYRA_VERCEL_PROJECT_ID",
    !githubToken && "GITHUB_TOKEN",
    (!org || !repo) && "GITHUB_REPO",
  ].filter(Boolean);
  if (missing.length) throw new Error(`${SETUP_HINT} (지금 없는 값: ${missing.join(", ")})`);

  return { token, teamId, projectId, org, repo, ref, name, githubToken };
}

async function request(path, { env, fetcher, method = "GET", body }) {
  const cfg = config(env);
  const res = await fetcher(`${API}${path}${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(cfg.teamId)}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || data?.message || `Vercel API ${res.status}`;
    // 401·403은 토큰이 만료됐거나 팀·프로젝트 권한이 맞지 않을 때다. 어느 쪽이든
    // 사람이 할 일은 같으므로 원인을 캐묻지 않고 바로 해결법을 준다.
    if (res.status === 401 || res.status === 403 || data?.error?.invalidToken || /not authorized|forbidden/i.test(message)) {
      throw new Error(`Vercel 배포 토큰이 거부됐습니다(${res.status}). ${SETUP_HINT}`);
    }
    throw new Error(String(message).slice(0, 300));
  }
  return data;
}

// 지금 어느 경로로 배포되는지 — 환경변수를 넣었는데도 안 먹을 때 원인을 눈으로 본다.
// Vercel 환경변수는 "추가한 뒤 다시 배포해야" 실행 중인 빌드에 들어간다. 그걸 모르면
// 값을 넣고도 왜 그대로인지 알 수 없다. 값 자체는 절대 내보내지 않는다 — 훅 주소는
// 그것만으로 배포를 걸 수 있는 비밀이다.
export function deployStatus({ env = process.env } = {}) {
  const missing = [
    !env.LYRA_VERCEL_TOKEN && "LYRA_VERCEL_TOKEN",
    !(env.LYRA_VERCEL_TEAM_ID || env.VERCEL_TEAM_ID) && "LYRA_VERCEL_TEAM_ID",
    !(env.LYRA_VERCEL_PROJECT_ID || env.VERCEL_PROJECT_ID) && "LYRA_VERCEL_PROJECT_ID",
    !env.GITHUB_REPO && "GITHUB_REPO",
    !env.GITHUB_TOKEN && "GITHUB_TOKEN",
  ].filter(Boolean);
  return {
    mode: missing.length ? "none" : "source",
    tokenMissing: missing,
    hint: missing.length ? SETUP_HINT : "",
  };
}

export async function resolveHeadSha({ env = process.env, fetcher = fetch } = {}) {
  const [org, repo] = String(env.GITHUB_REPO || "").split("/");
  const token = env.GITHUB_TOKEN;
  if (!org || !repo || !token) throw new Error("GITHUB_REPO/GITHUB_TOKEN이 없어 커밋을 확인할 수 없습니다");
  const ref = env.GITHUB_BRANCH || "main";
  const res = await fetcher(
    `https://api.github.com/repos/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "lyra-admin-deploy",
      },
      cache: "no-store",
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !/^[0-9a-f]{40}$/i.test(data.sha || "")) throw new Error(data?.message || "GitHub commit SHA 확인 실패");
  return data.sha;
}

export function deploymentView(data) {
  return {
    id: data.id,
    url: data.url ? `https://${data.url}` : "",
    state: data.readyState || data.state || data.status || "QUEUED",
    commitSha: data.meta?.githubCommitSha || "",
    commitMessage: data.meta?.githubCommitMessage || "",
  };
}

export async function createProductionDeployment({
  env = process.env,
  fetcher = fetch,
  deployer,
  sourceProvider,
  sha = "",
} = {}) {
  // Deploy Hook 경로는 지원하지 않는다. 진행 상태를 조회할 수 없고 job id가
  // deployment id와 형식이 달라, 장부가 READY로 닫히지 못하는 반쪽 상태를 만들었다.
  // 운영은 source 모드다(VERCEL_DEPLOY_HOOK 미설정 확인, 2026-08-19). 훅이
  // 설정돼 있어도 무시한다 — 반쪽 지원보다 한 경로가 낫다.
  const cfg = config(env);
  // 장부에 잡힌 SHA 그대로 내려받아 배포한다 — claim과 다운로드 사이에 main이
  // 움직여도, 배포되는 것은 언제나 잠근 커밋이다. (tarball/commits API는 SHA도 ref로 받는다)
  if (/^[0-9a-f]{40}$/i.test(sha)) cfg.ref = sha;
  const data = await deployGitHubSnapshot({ cfg, fetcher, deployer, sourceProvider });
  return deploymentView(data);
}

// 운영 반영 판정 — deploymentId는 항상 일치해야 하고, 기대 SHA가 온전한 40자리면
// /api/version.sha도 일치해야 한다. SHA 비교를 건너뛰는 경우는 하나뿐이다:
// 기대값이 40자리 SHA가 아닐 때(과거 CLI 배포 등으로 장부에 SHA가 없던 행) —
// 그때는 deploymentId 일치만으로 반영을 인정한다. 값은 앞 7자리만 밖으로 낸다.
export function productionMatches(version, { deploymentId, commitSha = "" }) {
  if (!version || version.deploymentId !== deploymentId)
    return { ok: false, reason: `deployment 불일치 (기대 ${String(deploymentId).slice(0, 11)}…, 운영 ${String(version?.deploymentId || "?").slice(0, 11)}…)` };
  if (/^[0-9a-f]{40}$/i.test(commitSha) && version.sha !== commitSha)
    return { ok: false, reason: `커밋 불일치 (기대 ${commitSha.slice(0, 7)}, 운영 ${String(version?.sha || "?").slice(0, 7)})` };
  return { ok: true, reason: "" };
}

export async function readDeployment(id, { env = process.env, fetcher = fetch } = {}) {
  if (!/^dpl_[A-Za-z0-9]+$/.test(String(id || ""))) throw new Error("잘못된 배포 ID입니다");
  const data = await request(`/v13/deployments/${encodeURIComponent(id)}`, { env, fetcher });
  return deploymentView(data);
}
