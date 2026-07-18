import fs from "fs";
import path from "path";

// Local dev writes .md files directly (instant hot-reload).
// On Vercel the filesystem is read-only, so writes go through the GitHub
// contents API — each write is a commit that triggers a redeploy.
const REPO = process.env.GITHUB_REPO; // e.g. "bluehhhh-byte/lyra"
const TOKEN = process.env.GITHUB_TOKEN;
const useGit = !!(REPO && TOKEN);

// On Vercel the FS is read-only; writes must use GitHub. Fail loud if misconfigured.
function assertWritable() {
  if (!useGit && process.env.NODE_ENV === "production")
    throw new Error("온라인 저장/삭제에는 GITHUB_TOKEN·GITHUB_REPO 환경변수가 필요합니다");
}

const safeSlug = (slug) => path.basename(String(slug)); // no path traversal

// One .md store, parameterized by collection dir ("songs" | "movies"). Songs and
// movies share the identical read/write/delete-a-markdown-file logic — only the
// directory differs, so the store is a factory and each collection binds its dir.
function makeStore(dir) {
  const DIR = path.join(process.cwd(), dir);
  const ghUrl = (slug) =>
    `https://api.github.com/repos/${REPO}/contents/${dir}/${encodeURIComponent(safeSlug(slug))}.md`;
  const gh = (method, slug, body) =>
    fetch(ghUrl(slug), {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

  const read = async (slug) => {
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
  };

  const write = async (slug, raw, message) => {
    assertWritable();
    if (useGit) {
      const existing = await read(slug); // sha needed to overwrite
      const res = await gh("PUT", slug, {
        message: message || `chore(${dir}): ${slug}`,
        content: Buffer.from(raw, "utf8").toString("base64"),
        sha: existing?.sha,
      });
      if (!res.ok) throw new Error(`GitHub write ${res.status}: ${await res.text()}`);
      return;
    }
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `${safeSlug(slug)}.md`), raw);
  };

  const remove = async (slug, message) => {
    assertWritable();
    if (useGit) {
      const existing = await read(slug);
      if (!existing) return;
      const res = await gh("DELETE", slug, { message: message || `chore(${dir}): delete ${slug}`, sha: existing.sha });
      if (!res.ok) throw new Error(`GitHub delete ${res.status}`);
      return;
    }
    const file = path.join(DIR, `${safeSlug(slug)}.md`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  };

  return { read, write, remove };
}

const songs = makeStore("songs");
const movies = makeStore("movies");

export const readSong = songs.read;
export const writeSong = songs.write;
export const deleteSong = songs.remove;
export const readMovie = movies.read;
export const writeMovie = movies.write;
export const deleteMovie = movies.remove;
