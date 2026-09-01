import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { getAllSongs } from "../lib/songs.js";
import {
  APPEARANCE_ROLES,
  WORK_TYPES,
  appearanceContext,
  appearanceIdentity,
  normalizeAppearanceData,
} from "../lib/song-appearances.js";

const args = new Set(process.argv.slice(2));
const audit = JSON.parse(fs.readFileSync(new URL("../data/song-appearance-backfill.json", import.meta.url), "utf8"));
const dataset = normalizeAppearanceData(JSON.parse(fs.readFileSync(new URL("../data/song-appearances.json", import.meta.url), "utf8")));
const songs = getAllSongs().map((song) => ({
  slug: String(song.slug), title: String(song.title || ""), artist: String(song.artist || ""),
  album: String(song.album || ""), year: Number(song.year) || null,
})).sort((a, b) => a.slug.localeCompare(b.slug));
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const corpusDigest = digest(JSON.stringify(songs));
const terminal = new Set(["verified", "existing_verified", "no_match", "rejected", "retryable"]);

function coverage() {
  assert.equal(audit.version, 1);
  assert.equal(audit.totalSongs, songs.length);
  assert.equal(audit.corpusDigest, corpusDigest);
  assert.deepEqual(Object.keys(audit.results).sort(), songs.map((song) => song.slug).sort());
  for (const song of songs) {
    const result = audit.results[song.slug];
    assert.ok(terminal.has(result?.status), `${song.slug}: terminal research status missing`);
    if (result.status === "retryable") {
      assert.ok(["screen", "verify"].includes(result.phase), `${song.slug}: retry phase missing`);
      assert.ok(result.reason, `${song.slug}: retry reason missing`);
      assert.ok(Number(result.attempts) >= 1, `${song.slug}: retry attempts missing`);
    }
  }
  console.log("song appearance coverage verification passed");
}

function evidenceErrors(value, sources) {
  const errors = [];
  if (!value.workTitle) errors.push("work title");
  if (!Object.hasOwn(WORK_TYPES, value.workType)) errors.push("work type");
  if (!Object.hasOwn(APPEARANCE_ROLES, value.role)) errors.push("role");
  if (!/^https?:\/\//i.test(value.evidenceUrl || "")) errors.push("evidence URL");
  if (!sources.some((source) => String(source.uri).replace(/\/$/, "") === String(value.evidenceUrl).replace(/\/$/, ""))) errors.push("ungrounded evidence URL");
  return errors;
}

function evidence() {
  const songSlugs = new Set(songs.map((song) => song.slug));
  const identities = new Set();
  let verified = 0;
  for (const [slug, result] of Object.entries(audit.results)) {
    assert.ok(songSlugs.has(slug), `${slug}: unknown song`);
    if (result.status !== "verified") continue;
    assert.ok((result.queries || []).length, `${slug}: web queries missing`);
    assert.ok((result.sources || []).length, `${slug}: grounded sources missing`);
    assert.ok((result.appearances || []).length, `${slug}: appearances missing`);
    for (const value of result.appearances) {
      assert.deepEqual(evidenceErrors(value, result.sources), [], `${slug}: invalid appearance evidence`);
      const identity = appearanceIdentity({ ...value, songSlug: slug });
      assert.ok(!identities.has(identity), `${slug}: duplicate researched identity ${identity}`);
      identities.add(identity);
      verified++;
    }
  }
  // Positive control: the same validator must reject an unsupported URL.
  assert.ok(evidenceErrors({ workTitle: "x", workType: "movie", role: "insert_song", evidenceUrl: "https://unsupported.example" }, []).includes("ungrounded evidence URL"));
  console.log(`verified researched appearances ${verified}`);
  console.log("song appearance evidence verification passed");
}

function datasetCheck() {
  const byIdentity = new Map();
  for (const item of dataset.items) {
    const identity = appearanceIdentity(item);
    assert.ok(!byIdentity.has(identity), `duplicate dataset identity ${identity}`);
    byIdentity.set(identity, item);
    if (item.status === "verified") assert.match(item.evidenceUrl, /^https?:\/\//i, `${identity}: verified item lacks evidence`);
    assert.ok(appearanceContext(item), `${identity}: public context missing`);
  }
  for (const baseline of audit.baseline || []) {
    const current = dataset.items.find((item) => item.id === baseline.id);
    assert.ok(current, `baseline item removed: ${baseline.id}`);
    assert.equal(digest(JSON.stringify(current)), baseline.digest, `baseline item changed: ${baseline.id}`);
  }
  for (const [slug, result] of Object.entries(audit.results)) {
    if (result.status !== "verified") continue;
    for (const value of result.appearances || []) {
      const identity = appearanceIdentity({ ...value, songSlug: slug });
      assert.ok(byIdentity.has(identity), `researched item not merged: ${identity}`);
    }
  }
  console.log(`dataset appearances ${dataset.items.length}`);
  console.log("song appearance dataset verification passed");
}

async function production() {
  const site = "https://lyracyno.vercel.app";
  const versionResponse = await fetch(`${site}/api/version`, { cache: "no-store" });
  assert.equal(versionResponse.status, 200);
  const version = await versionResponse.json();
  assert.equal(version.contentStore, "neon");
  assert.equal(version.contentFallback, false);
  assert.match(String(version.deploymentId || ""), /^dpl_/);
  const item = dataset.items.find((value) => value.status === "verified" && value.id.startsWith("backfill-")) ||
    dataset.items.find((value) => value.status === "verified");
  assert.ok(item, "no verified appearance available for production probe");
  const pageResponse = await fetch(`${site}/songs/${encodeURIComponent(item.songSlug)}`, { cache: "no-store" });
  assert.equal(pageResponse.status, 200);
  const html = await pageResponse.text();
  assert.match(html, /data-song-appearances/);
  assert.ok(html.includes(item.workTitle), `production page does not include ${item.workTitle}`);
  console.log(`production probe ${item.songSlug} → ${item.workTitle}`);
  console.log("production song appearance verification passed");
}

if (args.has("--coverage")) coverage();
else if (args.has("--evidence")) evidence();
else if (args.has("--dataset")) datasetCheck();
else if (args.has("--production")) await production();
else {
  coverage();
  evidence();
  datasetCheck();
}
