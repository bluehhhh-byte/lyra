function assertResponse(response, message) {
  if (!response.ok) throw new Error(`${message}: HTTP ${response.status}`);
}

export async function verifyProduction({
  site,
  beforeDeployment = "",
  fetcher = fetch,
  attempts = 6,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const base = new URL(site);
  if (base.protocol !== "https:") throw new Error("Production site must use HTTPS");
  base.pathname = "/";
  base.search = "";

  let version;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const versionUrl = new URL("api/version", base);
    versionUrl.searchParams.set("verify", `${Date.now()}-${attempt}`);
    const versionResponse = await fetcher(versionUrl, {
      headers: { "cache-control": "no-cache" },
      cache: "no-store",
    });
    assertResponse(versionResponse, "Production version check failed");
    version = await versionResponse.json();
    if (!version?.deploymentId) throw new Error("Production did not return a deployment ID");
    if (!beforeDeployment || version.deploymentId !== beforeDeployment) break;
    if (attempt < attempts - 1) await wait(1000 * (attempt + 1));
  }
  if (beforeDeployment && version.deploymentId === beforeDeployment) {
    throw new Error(`Production alias still points to the previous deployment after ${attempts} checks: ${beforeDeployment}`);
  }

  const adminResponse = await fetcher(new URL("admin", base), {
    redirect: "manual",
    cache: "no-store",
  });
  const location = adminResponse.headers.get("location");
  const loginUrl = location ? new URL(location, base) : null;
  if (![307, 308].includes(adminResponse.status) || loginUrl?.pathname !== "/admin/login") {
    throw new Error(`Admin auth boundary failed: HTTP ${adminResponse.status}`);
  }

  const loginResponse = await fetcher(new URL("admin/login", base), { cache: "no-store" });
  assertResponse(loginResponse, "Admin login page check failed");
  const loginBody = await loginResponse.text();
  if (!loginBody.includes("관리자 로그인")) throw new Error("Admin login page body is missing");

  return { deploymentId: version.deploymentId };
}
