import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { getAllSongs, parseFrontmatter } from "../lib/songs.js";
import { carouselArtworkSrc, isTrustedArtworkUrl } from "../lib/artwork-source.js";

const args = new Set(process.argv.slice(2));
const audit = JSON.parse(fs.readFileSync(new URL("../data/album-cover-audit.json", import.meta.url), "utf8"));
const songs = getAllSongs()
  .map((song) => ({ slug: song.slug, title: song.title || "", artist: song.artist || "", artwork: song.artwork || "" }))
  .sort((a, b) => a.slug.localeCompare(b.slug));
const corpusDigest = crypto.createHash("sha256").update(JSON.stringify(
  songs.map(({ slug, title, artist }) => ({ slug, title, artist })),
)).digest("hex");
const bySlug = new Map(songs.map((song) => [song.slug, song]));

function coverage() {
  assert.equal(audit.version, 1);
  assert.equal(audit.totalSongs, songs.length);
  assert.equal(audit.corpusDigest, corpusDigest);
  assert.deepEqual(Object.keys(audit.results).sort(), songs.map((song) => song.slug).sort());
  for (const song of songs) {
    const result = audit.results[song.slug];
    assert.equal(result?.phase, "complete", `${song.slug}: cover audit incomplete`);
    assert.equal(result?.status, "verified", `${song.slug}: cover unresolved`);
    assert.deepEqual(result?.researchIdentity, { title: song.title, artist: song.artist });
  }
  assert.equal(audit.summary.unresolved, 0);
  console.log(`album cover coverage ${songs.length} songs · no retryable results`);
  console.log("exhaustive album cover coverage passed");
}

function images() {
  for (const song of songs) {
    const result = audit.results[song.slug];
    assert.ok(isTrustedArtworkUrl(song.artwork), `${song.slug}: untrusted artwork`);
    assert.match(result.contentType, /^image\//, `${song.slug}: not an image`);
    assert.ok(result.httpStatus >= 200 && result.httpStatus < 300, `${song.slug}: HTTP ${result.httpStatus}`);
    assert.ok(["direct", "trusted-proxy"].includes(result.canvasAccess), `${song.slug}: no canvas path`);
    assert.ok(carouselArtworkSrc(song.artwork), `${song.slug}: proxy URL missing`);
  }
  const proxied = Object.values(audit.results).filter((result) => result.canvasAccess === "trusted-proxy").length;
  assert.ok(proxied > 0, "negative CORS control failed: no proxy-required cover detected");
  console.log(`${songs.length} live image responses · ${proxied} proxy-required songs`);
  console.log("exhaustive album cover image verification passed");
}

function positiveControls() {
  const song = bySlug.get("kenshi-yonezu-地球儀");
  assert.ok(song, "Spinning Globe missing");
  assert.equal(song.artwork, "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/45/5a/c9/455ac9fc-e38b-09c2-7e8f-79beeca04375/4547366634242.jpg/600x600bb.jpg");
  const raw = fs.readFileSync(new URL("../songs/kenshi-yonezu-地球儀.md", import.meta.url), "utf8");
  assert.match(raw, /^album: Chikyugi - Spinning Globe - Single$/m);
  assert.match(raw, /^trackId: 1695666895$/m);
  console.log("Kenshi Yonezu - Spinning Globe official release artwork verified");
  console.log("album cover positive controls passed");
}

async function neonCheck() {
  dotenv.config({ path: ".env.local", override: false, quiet: true });
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL missing");
  const sql = neon(process.env.DATABASE_URL);
  const [countRows, rows] = await Promise.all([
    sql`select count(*)::int as count from lyra_contents where kind = 'song'`,
    sql`select raw from lyra_contents where kind = 'song' and slug = 'kenshi-yonezu-地球儀' limit 1`,
  ]);
  assert.ok(Number(countRows[0]?.count) >= songs.length, "Neon song corpus is behind the local backup");
  assert.equal(rows.length, 1, "Spinning Globe missing in Neon");
  const { meta } = parseFrontmatter(rows[0].raw);
  assert.equal(meta.artwork, "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/45/5a/c9/455ac9fc-e38b-09c2-7e8f-79beeca04375/4547366634242.jpg/600x600bb.jpg");
  assert.equal(String(meta.trackId), "1695666895");
  console.log(`Neon songs ${countRows[0].count} · Spinning Globe official artwork`);
  console.log("Neon album cover correction verified");
}

async function production() {
  const site = "https://lyracyno.vercel.app";
  const versionResponse = await fetch(`${site}/api/version`, { cache: "no-store" });
  assert.equal(versionResponse.status, 200);
  const version = await versionResponse.json();
  assert.equal(version.contentStore, "neon");
  assert.equal(version.contentFallback, false);
  assert.match(String(version.deploymentId || ""), /^dpl_/);

  const yonezu = bySlug.get("kenshi-yonezu-地球儀");
  const page = await fetch(`${site}/songs/${encodeURIComponent(yonezu.slug)}`, { cache: "no-store" });
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("4547366634242.jpg"), "production page has stale Spinning Globe artwork");

  const proxyControls = Object.values(audit.results).filter((item) => item.canvasAccess === "trusted-proxy").slice(0, 3);
  assert.equal(proxyControls.length, 3);
  for (const control of proxyControls) {
    const response = await fetch(`${site}${carouselArtworkSrc(control.artwork)}`, { cache: "no-store" });
    assert.equal(response.status, 200, control.artwork);
    assert.match(response.headers.get("content-type") || "", /^image\//);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    await response.body?.cancel();
  }
  console.log(`production proxy probes ${proxyControls.length} · deployment ${version.deploymentId}`);
  console.log("production album cover verification passed");
}

if (args.has("--coverage")) coverage();
else if (args.has("--images")) images();
else if (args.has("--positive-controls")) positiveControls();
else if (args.has("--neon")) await neonCheck();
else if (args.has("--production")) await production();
else { coverage(); images(); positiveControls(); }
