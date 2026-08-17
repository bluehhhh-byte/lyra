const API = "https://api.vercel.com";

// 배포가 막혔을 때 화면에 뜨는 안내. 원인이 무엇이든 할 일은 하나다 —
// Vercel에서 Deploy Hook을 만들어 환경변수에 넣는 것. 토큰과 달리 만료가 없고,
// 권한도 "이 프로젝트를 빌드해라" 하나뿐이라 더 안전하다.
const SETUP_HINT =
  "Vercel → Settings → Git → Deploy Hooks에서 main 브랜치 훅을 만들고, 그 주소를 환경변수 VERCEL_DEPLOY_HOOK에 넣어 주세요";

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
  // 무엇이 없는지만 알려주면 그다음에 뭘 해야 하는지는 여전히 모른다.
  // 토큰 세 개를 채우는 것보다 Deploy Hook 하나를 만드는 쪽이 훨씬 간단하므로 그리로 안내한다.
  if (missing.length) throw new Error(`${SETUP_HINT} (지금 없는 값: ${missing.join(", ")})`);

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
  const raw = env.VERCEL_DEPLOY_HOOK || "";
  let hook = "none";
  if (raw) {
    try {
      hook = deployHook(env) ? "ok" : "none";
    } catch {
      hook = "invalid"; // 값은 있는데 훅 주소 형식이 아니다
    }
  }
  const missing = [
    !env.LYRA_VERCEL_TOKEN && "LYRA_VERCEL_TOKEN",
    !(env.LYRA_VERCEL_TEAM_ID || env.VERCEL_TEAM_ID) && "LYRA_VERCEL_TEAM_ID",
    !(env.LYRA_VERCEL_PROJECT_ID || env.VERCEL_PROJECT_ID) && "LYRA_VERCEL_PROJECT_ID",
    !env.GITHUB_REPO && "GITHUB_REPO",
  ].filter(Boolean);
  return {
    mode: hook === "ok" ? "hook" : missing.length ? "none" : "token",
    hook,
    tokenMissing: missing,
    hint: hook === "ok" ? "" : SETUP_HINT,
  };
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
