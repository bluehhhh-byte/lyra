import crypto from "node:crypto";
import fs from "node:fs";
import { getAllSongs } from "../lib/songs.js";
import { isTrustedArtworkUrl } from "../lib/artwork-source.js";

const WRITE = process.argv.includes("--write");
const songs = getAllSongs()
  .map((song) => ({ slug: song.slug, title: song.title || "", artist: song.artist || "", artwork: song.artwork || "" }))
  .sort((a, b) => a.slug.localeCompare(b.slug));
const corpusDigest = crypto.createHash("sha256").update(JSON.stringify(
  songs.map(({ slug, title, artist }) => ({ slug, title, artist })),
)).digest("hex");
const uniqueUrls = [...new Set(songs.map((song) => song.artwork))];
const checkedAt = new Date().toISOString();

async function inspect(url) {
  if (!isTrustedArtworkUrl(url)) return { status: "rejected", error: "untrusted-or-invalid-url" };
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { Range: "bytes=0-2047", "User-Agent": "LyraAlbumCoverAudit/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
    const cors = response.headers.get("access-control-allow-origin") || "";
    await response.body?.cancel();
    if (!response.ok || !contentType.startsWith("image/"))
      return { status: "rejected", httpStatus: response.status, contentType, cors, error: "not-an-image-response" };
    return {
      status: "verified",
      httpStatus: response.status,
      contentType,
      cors,
      canvasAccess: cors === "*" || cors === "https://lyracyno.vercel.app" ? "direct" : "trusted-proxy",
    };
  } catch (error) {
    return { status: "retryable", error: error.message };
  }
}

const byUrl = new Map();
let cursor = 0;
await Promise.all(Array.from({ length: 24 }, async () => {
  while (cursor < uniqueUrls.length) {
    const url = uniqueUrls[cursor++];
    byUrl.set(url, await inspect(url));
  }
}));

const results = Object.fromEntries(songs.map((song) => {
  const remote = byUrl.get(song.artwork);
  return [song.slug, {
    researchIdentity: { title: song.title, artist: song.artist },
    artwork: song.artwork,
    host: isTrustedArtworkUrl(song.artwork) ? new URL(song.artwork).hostname : "",
    phase: remote?.status === "verified" ? "complete" : "incomplete",
    checkedAt,
    ...remote,
  }];
}));

const values = Object.values(results);
const audit = {
  version: 1,
  generatedAt: checkedAt,
  method: "codex-direct-http-image-and-canvas-cors-audit",
  totalSongs: songs.length,
  uniqueCovers: uniqueUrls.length,
  corpusDigest,
  summary: {
    verified: values.filter((item) => item.status === "verified").length,
    directCanvas: values.filter((item) => item.canvasAccess === "direct").length,
    trustedProxy: values.filter((item) => item.canvasAccess === "trusted-proxy").length,
    unresolved: values.filter((item) => item.status !== "verified").length,
  },
  results,
};

if (WRITE) fs.writeFileSync(new URL("../data/album-cover-audit.json", import.meta.url), `${JSON.stringify(audit, null, 1)}\n`);
console.log(`${audit.totalSongs} songs · ${audit.uniqueCovers} unique covers`);
console.log(`canvas direct ${audit.summary.directCanvas} · trusted proxy ${audit.summary.trustedProxy} · unresolved ${audit.summary.unresolved}`);
if (audit.summary.unresolved) process.exitCode = 1;
else console.log("exhaustive album cover audit completed");
