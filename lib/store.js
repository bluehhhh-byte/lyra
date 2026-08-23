import fs from "fs";
import path from "path";
import {
  databaseContentEnabled,
  readContentRow,
  writeContentRow,
  deleteContentRow,
  readCachedDataRow,
  writeDataRow,
  rowTag,
} from "./content-db.js";

// Local dev writes .md files directly (instant hot-reload). Production uses Neon.
//
// GitHub는 production 쓰기 경로가 아니다.
//
// 예전에는 LYRA_CONTENT_STORE=neon이 빠지고 GITHUB_TOKEN·GITHUB_REPO가 남아 있으면
// 저장이 조용히 GitHub Contents API로 넘어갔다. 그 경로는 파일당 커밋을 만든다 —
// 2026-08-01에 왓챠 임포트 1,011건이 11분에 1,059커밋을 만들어 계정이 abuse
// 플래그에 걸렸고, 이 글을 쓰는 지금도 풀리지 않았다. 환경변수 하나를 빠뜨린
// 대가가 그것이어서는 안 된다.
//
// 그래서 production에서는 GitHub 경로 자체를 열지 않는다. 읽기 폴백도 필요 없다 —
// songs/*.md가 배포 번들에 함께 들어가므로 로컬 파일이 이미 백업 역할을 한다.
// GitHub는 수동 backup/export 대상으로만 남는다(scripts/dump-content.mjs).
const REPO = process.env.GITHUB_REPO; // e.g. "bluehhhh-byte/lyra"
const TOKEN = process.env.GITHUB_TOKEN;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const isProduction = () => process.env.NODE_ENV === "production";
const useGit = !!(REPO && TOKEN) && process.env.NODE_ENV !== "production";

// production에서 쓰기는 Neon이 아니면 실패한다 — 조용히 다른 경로로 새지 않는다.
function assertWritable() {
  if (isProduction() && !databaseContentEnabled())
    throw new Error(
      "콘텐츠 저장에는 Neon이 필요합니다. 환경변수 LYRA_CONTENT_STORE를 neon으로, " +
        "DATABASE_URL을 Neon 접속 문자열로 설정한 뒤 다시 배포하세요. " +
        "(붙여넣기에 BOM·따옴표가 섞이면 값이 있어도 인식되지 않습니다 — /api/version의 contentStore로 확인)"
    );
  if (!databaseContentEnabled() && !useGit && isProduction())
    throw new Error("온라인 저장/삭제에는 Neon 설정이 필요합니다");
}

async function invalidate(kind, slug) {
  const { revalidateTag, revalidatePath } = await import("next/cache");
  // 목록 계열(샤드·메타)은 lyra-content / lyra-{kind}s가 함께 덮는다.
  revalidateTag("lyra-content");
  revalidateTag(kind === "song" ? "lyra-songs" : "lyra-movies");
  // 상세 단건 캐시는 slug별로 따로 있다. 위 태그로도 덮이지만 명시해 둔다 —
  // 목록 태그를 좁히는 날 이 줄이 없으면 상세만 옛 값으로 남는다.
  revalidateTag(rowTag(kind, slug));
  revalidatePath(kind === "song" ? `/songs/${slug}` : `/movies/${slug}`);
  revalidatePath("/");
}

const safeSlug = (slug) => path.basename(String(slug)); // no path traversal

// One .md store, parameterized by collection dir. Songs, movies and curated
// songs and movies share the same read/write/delete logic.
function makeStore(dir, kind) {
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
    if (databaseContentEnabled()) {
      const row = await readContentRow(kind, safeSlug(slug));
      return row ? { raw: row.raw, sha: String(row.revision) } : null;
    }
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
    if (databaseContentEnabled()) {
      await writeContentRow(kind, safeSlug(slug), raw);
      await invalidate(kind, safeSlug(slug));
      return;
    }
    if (useGit) {
      // 409 = 다른 저장이 먼저 커밋해 sha가 낡음 — 새 sha로 딱 한 번 재시도
      for (let attempt = 0; attempt < 2; attempt++) {
        const existing = await read(slug); // sha needed to overwrite
        const res = await gh("PUT", slug, {
          message: message || `chore(${dir}): ${slug}`,
          content: Buffer.from(raw, "utf8").toString("base64"),
          sha: existing?.sha,
        });
        if (res.ok) return;
        if (res.status !== 409 || attempt)
          throw new Error(`GitHub write ${res.status}: ${await res.text()}`);
      }
      return;
    }
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `${safeSlug(slug)}.md`), raw);
  };

  const remove = async (slug, message) => {
    assertWritable();
    if (databaseContentEnabled()) {
      await deleteContentRow(kind, safeSlug(slug));
      await invalidate(kind, safeSlug(slug));
      return;
    }
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

const songs = makeStore("songs", "song");
const movies = makeStore("movies", "movie");

export const readSong = songs.read;
export const writeSong = songs.write;
export const deleteSong = songs.remove;
export const readMovie = movies.read;
export const writeMovie = movies.write;
export const deleteMovie = movies.remove;

// Plain-file-shaped store for the watched dataset (data/*.json). In Neon mode
// the unchanged JSON string lives in lyra_data; fallback uses GitHub/local FS.
// Restricted to a basename under data/ so it can't be turned into arbitrary write.
export async function writeData(name, content, message) {
  assertWritable();
  const file = `data/${path.basename(name)}`;
  if (databaseContentEnabled()) {
    await writeDataRow(path.basename(name), content);
    const { revalidateTag, revalidatePath } = await import("next/cache");
    revalidateTag("lyra-data");
    revalidatePath("/");
    return;
  }
  if (useGit) {
    const url = `https://api.github.com/repos/${REPO}/contents/${file}`;
    const head = {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    // 409 = 동시 저장으로 sha가 낡음 — 새 sha로 한 번 재시도
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = await fetch(url, { headers: head, cache: "no-store" });
      const sha = cur.ok ? (await cur.json()).sha : undefined;
      const res = await fetch(url, {
        method: "PUT",
        headers: head,
        body: JSON.stringify({ message, content: Buffer.from(content).toString("base64"), sha }),
      });
      if (res.ok) return;
      if (res.status !== 409 || attempt) throw new Error(`GitHub write ${res.status}`);
    }
    return;
  }
  const abs = path.join(process.cwd(), file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// 여러 파일을 한 커밋으로 묶는다.
//
// contents API는 파일 하나에 커밋 하나다. 일괄 작업이 30곡을 고치면 커밋 30개가
// 몇 초 안에 연달아 나가고, 그만큼 배포가 30번 돈다. 2026-08-15에 이 패턴이
// GitHub 남용 탐지에 걸려 계정의 push 이벤트 발화가 멈췄고, Actions와 Vercel
// webhook이 함께 죽었다(저장소 push는 계속 돼서 원인을 찾기 어려웠다).
//
// Git Data API는 트리를 통째로 만들고 커밋 하나만 붙인다. 30곡이든 300곡이든
// 커밋 1개 · 배포 1회다.
//
// files: [{ path: "songs/x.md", content: "..." }] — content가 null이면 삭제.
// path는 저장소 루트 기준이고 상위로 빠져나갈 수 없다.
const safePath = (p) => {
  const rel = path.posix.normalize(String(p).replace(/\\/g, "/"));
  if (rel.startsWith("../") || rel.startsWith("/") || rel === "..")
    throw new Error(`저장소 밖 경로: ${p}`);
  return rel;
};

export async function commitFiles(files, message) {
  assertWritable();
  const list = files.map((f) => ({ ...f, path: safePath(f.path) }));
  if (!list.length) return null;

  if (databaseContentEnabled()) {
    await Promise.all(list.map(async (f) => {
      const match = f.path.match(/^(songs|movies)\/([^/]+)\.md$/);
      if (match) {
        const kind = match[1] === "songs" ? "song" : "movie";
        if (f.content === null) await deleteContentRow(kind, match[2]);
        else await writeContentRow(kind, match[2], f.content);
        return;
      }
      const dataMatch = f.path.match(/^data\/([^/]+\.json)$/);
      if (dataMatch && f.content !== null) {
        await writeDataRow(dataMatch[1], f.content);
        return;
      }
      throw new Error(`DB 저장소가 지원하지 않는 경로: ${f.path}`);
    }));
    const { revalidateTag, revalidatePath } = await import("next/cache");
    revalidateTag("lyra-content");
    revalidateTag("lyra-songs");
    revalidateTag("lyra-movies");
    revalidateTag("lyra-data");
    // 손댄 slug의 상세 캐시도 각각 무효화한다 — 위 목록 태그로도 덮이지만,
    // 일괄 저장은 한 번에 수백 건을 바꾸므로 빠뜨리면 상세만 옛 값으로 남는다.
    for (const f of list) {
      const match = f.path.match(/^(songs|movies)\/([^/]+)\.md$/);
      if (match) revalidateTag(rowTag(match[1] === "songs" ? "song" : "movie", match[2]));
    }
    revalidatePath("/");
    return "database";
  }

  if (!useGit) {
    for (const f of list) {
      const abs = path.join(process.cwd(), f.path);
      if (f.content === null) {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
        continue;
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, f.content);
    }
    return null;
  }

  const api = `https://api.github.com/repos/${REPO}/git`;
  const head = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const call = async (url, init) => {
    const res = await fetch(url, { ...init, headers: head, cache: "no-store" });
    if (!res.ok) {
      const err = new Error(`GitHub ${init?.method || "GET"} ${url.replace(api, "")} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  };
  const post = (url, body) => call(url, { method: "POST", body: JSON.stringify(body) });

  // ref가 그 사이 움직였으면(다른 저장이 먼저 커밋) 처음부터 다시 잡는다.
  // 트리를 새 base 위에 다시 쌓는 것이라 남의 커밋을 덮어쓰지 않는다.
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await call(`${api}/ref/heads/${BRANCH}`);
    const baseSha = ref.object.sha;
    const base = await call(`${api}/commits/${baseSha}`);
    const tree = await post(`${api}/trees`, {
      base_tree: base.tree.sha,
      tree: list.map((f) =>
        f.content === null
          ? { path: f.path, mode: "100644", type: "blob", sha: null }
          : { path: f.path, mode: "100644", type: "blob", content: f.content }
      ),
    });
    const commit = await post(`${api}/commits`, { message, tree: tree.sha, parents: [baseSha] });
    try {
      await call(`${api}/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
      return commit.sha;
    } catch (e) {
      // 422 = fast-forward가 아님 — 그 사이 누가 커밋했다
      if (e.status !== 422 || attempt === 2) throw e;
    }
  }
  return null;
}

export function readData(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", path.basename(name)), "utf8"));
  } catch {
    return fallback;
  }
}

export async function readRuntimeData(name, fallback) {
  if (!databaseContentEnabled()) return readData(name, fallback);
  let row;
  try {
    row = await readCachedDataRow(path.basename(name));
  } catch (err) {
    // 곡·영화와 같은 이유로 파일 백업 폴백 — lib/songs.js의 getAllSongsRuntime 주석 참조
    console.error(`[store] ${name} DB 읽기 실패 — 파일 백업으로 서빙한다: ${err.message}`);
    return readData(name, fallback);
  }
  if (!row) return fallback;
  try {
    return JSON.parse(row.raw);
  } catch {
    return fallback;
  }
}
