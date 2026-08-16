const API = "https://api.vercel.com";

function deployHook(env) {
  const raw = env.VERCEL_DEPLOY_HOOK;
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("VERCEL_DEPLOY_HOOK 주소가 올바르지 않습니다");
  }
  if (url.protocol !== "https:" || url.hostname !== "api.vercel.com" || !url.pathname.startsWith("/v1/integrations/deploy/")) {
    throw new Error("VERCEL_DEPLOY_HOOK 주소가 올바르지 않습니다");
  }
  return url.href;
}

function config(env) {
  const token = env.LYRA_VERCEL_TOKEN;
  const teamId = env.LYRA_VERCEL_TEAM_ID || env.VERCEL_TEAM_ID;
  const projectId = env.LYRA_VERCEL_PROJECT_ID || env.VERCEL_PROJECT_ID;
  const [org, repo] = String(env.GITHUB_REPO || "").split("/");
  const ref = env.GITHUB_BRANCH || "main";
  const name = env.LYRA_VERCEL_PROJECT_NAME || "lyra";

  const missing = [
    !token && "LYRA_VERCEL_TOKEN",
    !teamId && "LYRA_VERCEL_TEAM_ID",
    !projectId && "LYRA_VERCEL_PROJECT_ID",
    (!org || !repo) && "GITHUB_REPO",
  ].filter(Boolean);
  if (missing.length) throw new Error(`배포 환경변수가 없습니다: ${missing.join(", ")}`);

  return { token, teamId, projectId, org, repo, ref, name };
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
    if (res.status === 401 || data?.error?.invalidToken || /not authorized/i.test(message)) {
      throw new Error("Vercel 배포 토큰이 만료됐습니다. VERCEL_DEPLOY_HOOK을 설정해 주세요.");
    }
    throw new Error(String(message).slice(0, 300));
  }
  return data;
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

export async function createProductionDeployment({ env = process.env, fetcher = fetch } = {}) {
  const hook = deployHook(env);
  if (hook) {
    const res = await fetcher(hook, { method: "POST", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error?.message || data?.message || `Deploy Hook ${res.status}`;
      throw new Error(String(message).slice(0, 300));
    }
    return {
      id: data?.job?.id || "",
      url: "",
      state: "TRIGGERED",
      commitSha: "",
      commitMessage: "",
      pollable: false,
    };
  }
  const cfg = config(env);
  const data = await request("/v13/deployments", {
    env,
    fetcher,
    method: "POST",
    body: {
      name: cfg.name,
      project: cfg.projectId,
      target: "production",
      gitSource: { type: "github", org: cfg.org, repo: cfg.repo, ref: cfg.ref },
    },
  });
  return deploymentView(data);
}

export async function readDeployment(id, { env = process.env, fetcher = fetch } = {}) {
  if (!/^dpl_[A-Za-z0-9]+$/.test(String(id || ""))) throw new Error("잘못된 배포 ID입니다");
  const data = await request(`/v13/deployments/${encodeURIComponent(id)}`, { env, fetcher });
  return deploymentView(data);
}
