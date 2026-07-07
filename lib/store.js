import fs from "fs";
import path from "path";

// Local dev writes .md files directly (instant hot-reload).
// On Vercel the filesystem is read-only, so writes go through the GitHub
// contents API — each write is a commit that triggers a redeploy.
const REPO = process.env.GITHUB_REPO; // e.g. "bluehhhh-byte/lyra"
const TOKEN = process.env.GITHUB_TOKEN;
const useGit = !!(REPO && TOKEN);
const DIR = path.join(process.cwd(), "songs");

const safeSlug = (slug) => path.basename(String(slug)); // no path traversal

async function gh(method, slug, body) {
  const url = `https://api.github.com/repos/${REPO}/contents/songs/${encodeURIComponent(safeSlug(slug))}.md`;
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}

export async function readSong(slug) {
  if (useGit) {
    const res = await gh("GET", slug);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub read ${res.status}`);
    const j = await res.json();
    return { raw: Buffer.from(j.content, "base64").toString("utf8"), sha: j.sha };
  }
  const file = path.join(DIR, `${safeSlug(slug)}.md`);
  if (!fs.existsSync(file)) return null;
  return { raw: fs.readFileSync(file, "utf8"), sha: null };
}

export async function writeSong(slug, raw, message) {
  if (useGit) {
    const existing = await readSong(slug); // sha needed to overwrite
    const res = await gh("PUT", slug, {
      message: message || `chore(song): ${slug}`,
      content: Buffer.from(raw, "utf8").toString("base64"),
      sha: existing?.sha,
    });
    if (!res.ok) throw new Error(`GitHub write ${res.status}: ${await res.text()}`);
    return;
  }
  fs.writeFileSync(path.join(DIR, `${safeSlug(slug)}.md`), raw);
}

export async function deleteSong(slug, message) {
  if (useGit) {
    const existing = await readSong(slug);
    if (!existing) return;
    const res = await gh("DELETE", slug, {
      message: message || `chore(song): delete ${slug}`,
      sha: existing.sha,
    });
    if (!res.ok) throw new Error(`GitHub delete ${res.status}`);
    return;
  }
  const file = path.join(DIR, `${safeSlug(slug)}.md`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
