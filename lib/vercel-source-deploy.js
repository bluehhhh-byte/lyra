import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { x as extractTar } from "tar";

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const VERCEL_API = "https://api.vercel.com";
const OMIT_DIRS = new Set([".git", ".next", ".vercel", "node_modules", "__pycache__"]);

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "lyra-admin-deploy",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubJson(url, { token, fetcher }) {
  const res = await fetcher(url, { headers: githubHeaders(token), cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `GitHub API ${res.status}`);
  return data;
}

export async function downloadGitHubSource({ owner, repo, ref, token, fetcher = fetch, root }) {
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const commit = await githubJson(`${base}/commits/${encodeURIComponent(ref)}`, { token, fetcher });
  if (!/^[0-9a-f]{40}$/i.test(commit.sha || "")) throw new Error("GitHub commit SHA is missing");

  const archiveRes = await fetcher(`${base}/tarball/${commit.sha}`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (!archiveRes.ok) {
    const data = await archiveRes.json().catch(() => ({}));
    throw new Error(data?.message || `GitHub archive ${archiveRes.status}`);
  }
  const declared = Number(archiveRes.headers.get("content-length") || 0);
  if (declared > MAX_ARCHIVE_BYTES) throw new Error("GitHub archive is too large");
  const bytes = Buffer.from(await archiveRes.arrayBuffer());
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("GitHub archive is too large");

  const sourceDir = path.join(root, "source");
  const archivePath = path.join(root, "source.tgz");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(archivePath, bytes);
  await extractTar({
    file: archivePath,
    cwd: sourceDir,
    strip: 1,
    preservePaths: false,
    filter: (_name, entry) => !["SymbolicLink", "Link"].includes(entry.type),
  });

  return {
    sourceDir,
    commit: {
      sha: commit.sha,
      message: String(commit.commit?.message || "").split("\n")[0].slice(0, 200),
      authorName: String(commit.commit?.author?.name || owner).slice(0, 100),
      authorEmail: String(commit.commit?.author?.email || "").slice(0, 200),
    },
  };
}

async function collectFiles(root, dir = root, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && OMIT_DIRS.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, absolute, files);
    } else if (entry.isFile()) {
      const data = await readFile(absolute);
      const info = await stat(absolute);
      files.push({
        file: path.relative(root, absolute).split(path.sep).join("/"),
        size: data.length,
        mode: info.mode,
        sha: createHash("sha1").update(data).digest("hex"),
        data,
      });
    }
  }
  return files;
}

function vercelHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json", ...extra };
}

async function responseData(res) {
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  const error = data?.error || data;
  const failure = new Error(error?.message || `Vercel API ${res.status}`);
  failure.code = error?.code;
  failure.missing = error?.missing;
  throw failure;
}

async function createFromFiles({ cfg, files, commit, fetcher }) {
  const query = new URLSearchParams({
    teamId: cfg.teamId,
    forceNew: "1",
    withCache: "1",
    skipAutoDetectionConfirmation: "1",
  });
  const body = {
    version: 2,
    name: cfg.name,
    target: "production",
    files: files.map(({ file, size, mode, sha }) => ({ file, size, mode, sha })),
    gitMetadata: {
      remoteUrl: `https://github.com/${cfg.org}/${cfg.repo}`,
      commitRef: cfg.ref,
      commitSha: commit.sha,
      commitMessage: commit.message,
      commitAuthorName: commit.authorName,
      commitAuthorEmail: commit.authorEmail,
      dirty: false,
    },
    meta: {
      githubCommitSha: commit.sha,
      githubCommitRef: cfg.ref,
      githubCommitRepo: cfg.repo,
      githubCommitOrg: cfg.org,
    },
  };
  const res = await fetcher(`${VERCEL_API}/v13/deployments?${query}`, {
    method: "POST",
    headers: vercelHeaders(cfg.token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return responseData(res);
}

async function uploadMissing({ cfg, files, missing, fetcher }) {
  const needed = new Set(missing || []);
  const unique = new Map(files.filter((file) => needed.has(file.sha)).map((file) => [file.sha, file]));
  if (unique.size !== needed.size) throw new Error("Vercel requested an unknown source file");
  const query = new URLSearchParams({ teamId: cfg.teamId });
  const queue = [...unique.values()];
  const workers = Array.from({ length: Math.min(10, queue.length) }, async () => {
    while (queue.length) {
      const file = queue.shift();
      const res = await fetcher(`${VERCEL_API}/v2/files?${query}`, {
        method: "POST",
        headers: vercelHeaders(cfg.token, {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(file.size),
          "x-now-digest": file.sha,
          "x-now-size": String(file.size),
        }),
        body: file.data,
      });
      await responseData(res);
    }
  });
  await Promise.all(workers);
}

async function directUpload({ cfg, sourceDir, commit, fetcher }) {
  const files = await collectFiles(sourceDir);
  try {
    return await createFromFiles({ cfg, files, commit, fetcher });
  } catch (error) {
    if (error.code !== "missing_files" || !Array.isArray(error.missing)) throw error;
    await uploadMissing({ cfg, files, missing: error.missing, fetcher });
    return createFromFiles({ cfg, files, commit, fetcher });
  }
}

export async function uploadSourceDeployment({ cfg, sourceDir, commit, fetcher = fetch, deployer = directUpload }) {
  const created = await deployer({ cfg, sourceDir, commit, fetcher });
  if (!created?.id) throw new Error("Vercel did not create a deployment");
  return created;
}

export async function deployGitHubSnapshot({
  cfg,
  fetcher = fetch,
  deployer = directUpload,
  sourceProvider = downloadGitHubSource,
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "lyra-source-"));
  try {
    const source = await sourceProvider({
      owner: cfg.org,
      repo: cfg.repo,
      ref: cfg.ref,
      token: cfg.githubToken,
      fetcher,
      root,
    });
    return await uploadSourceDeployment({ cfg, ...source, fetcher, deployer });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
