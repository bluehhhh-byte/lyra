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
const audit = JSON.parse(fs.readFileSync(new URL("../data/song-appearance-exhaustive.json", import.meta.url), "utf8"));
const dataset = normalizeAppearanceData(JSON.parse(fs.readFileSync(new URL("../data/song-appearances.json", import.meta.url), "utf8")));
const songs = getAllSongs().map((song) => ({
  slug: String(song.slug), title: String(song.title || ""), artist: String(song.artist || ""),
  album: String(song.album || ""), year: Number(song.year) || null, comment: String(song.comment || ""),
})).sort((a, b) => a.slug.localeCompare(b.slug));
const songBySlug = new Map(songs.map((song) => [song.slug, song]));
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const corpusDigest = digest(JSON.stringify(songs.map(({ slug, title, artist, album, year }) => ({ slug, title, artist, album, year }))));
const terminal = new Set(["verified", "existing_verified", "no_match"]);
const normalizedUrl = (value) => String(value || "").replace(/\/$/, "");

function coverage() {
  assert.equal(audit.version, 2);
  assert.equal(audit.totalSongs, songs.length);
  assert.equal(audit.corpusDigest, corpusDigest);
  assert.deepEqual(Object.keys(audit.results).sort(), songs.map((song) => song.slug).sort());
  for (const song of songs) {
    const result = audit.results[song.slug];
    assert.ok(terminal.has(result?.status), `${song.slug}: exhaustive research is not terminal (${result?.status})`);
    assert.equal(result.phase, "complete", `${song.slug}: exhaustive phase is incomplete`);
    assert.deepEqual(result.researchIdentity, { title: song.title, artist: song.artist }, `${song.slug}: exact research identity missing`);
    const providers = new Set((result.passes || []).map((pass) => pass.provider));
    assert.ok(providers.has("codex-web-search-screen"), `${song.slug}: grounded corpus screening pass missing`);
    if (result.screeningCandidate || result.status !== "no_match") {
      assert.ok(
        providers.has("codex-web-search-verify") || providers.has("curated-authoritative-review"),
        `${song.slug}: candidate-specific verification/review pass missing`,
      );
    }
    for (const pass of result.passes || []) {
      assert.ok((pass.queries || []).length, `${song.slug}: ${pass.provider} queries missing`);
      assert.ok(pass.researchedAt, `${song.slug}: ${pass.provider} research timestamp missing`);
    }
  }
  console.log(`exhaustive coverage ${songs.length} songs · no retryable results`);
  console.log("exhaustive song appearance coverage passed");
}

function evidenceErrors(value, result, song) {
  const errors = [];
  if (!value.workTitle) errors.push("work title");
  if (!Object.hasOwn(WORK_TYPES, value.workType)) errors.push("work type");
  if (!Object.hasOwn(APPEARANCE_ROLES, value.role)) errors.push("role");
  if (!/^https?:\/\//i.test(value.evidenceUrl || "")) errors.push("evidence URL");
  if (!(result.sources || []).some((source) => normalizedUrl(source.uri) === normalizedUrl(value.evidenceUrl))) errors.push("ungrounded evidence URL");
  if (result.researchIdentity?.title !== song.title || result.researchIdentity?.artist !== song.artist) errors.push("song identity");
  return errors;
}

function evidence() {
  const identities = new Set();
  let verified = 0;
  for (const [slug, result] of Object.entries(audit.results)) {
    if (result.status !== "verified") continue;
    const song = songBySlug.get(slug);
    assert.ok(song, `${slug}: unknown song`);
    assert.ok((result.queries || []).length, `${slug}: grounded queries missing`);
    assert.ok((result.sources || []).length, `${slug}: grounded sources missing`);
    assert.ok((result.appearances || []).length, `${slug}: verified result has no appearances`);
    for (const value of result.appearances) {
      assert.deepEqual(evidenceErrors(value, result, song), [], `${slug}: invalid grounded appearance`);
      const identity = appearanceIdentity({ ...value, songSlug: slug });
      assert.ok(!identities.has(identity), `${slug}: duplicate researched identity ${identity}`);
      identities.add(identity);
      verified++;
    }
  }
  const controlSong = songs[0];
  assert.ok(evidenceErrors({ workTitle: "x", workType: "movie", role: "insert_song", evidenceUrl: "https://unsupported.example" }, { sources: [], researchIdentity: { title: controlSong.title, artist: controlSong.artist } }, controlSong).includes("ungrounded evidence URL"));
  console.log(`grounded exhaustive appearances ${verified}`);
  console.log("exhaustive song appearance evidence passed");
}

function datasetCheck() {
  const byIdentity = new Map();
  const byId = new Map(dataset.items.map((item) => [item.id, item]));
  const allowedRepairs = new Set((audit.allowedBaselineRepairs || []).map((item) => item.id));
  for (const item of dataset.items) {
    const identity = appearanceIdentity(item);
    assert.ok(!byIdentity.has(identity), `duplicate dataset identity ${identity}`);
    byIdentity.set(identity, item);
    if (item.status === "verified") assert.match(item.evidenceUrl, /^https?:\/\//i, `${identity}: verified item lacks evidence`);
    assert.ok(appearanceContext(item), `${identity}: public context missing`);
  }
  for (const baseline of audit.baseline || []) {
    const current = byId.get(baseline.id);
    assert.ok(current, `baseline item removed: ${baseline.id}`);
    if (digest(JSON.stringify(current)) !== baseline.digest) {
      assert.ok(allowedRepairs.has(baseline.id), `baseline item changed: ${baseline.id}`);
      assert.equal(appearanceIdentity(current), baseline.identity, `baseline repair changed identity: ${baseline.id}`);
    }
  }
  for (const [slug, result] of Object.entries(audit.results)) {
    if (result.status !== "verified") continue;
    for (const value of result.appearances || []) {
      assert.ok(byIdentity.has(appearanceIdentity({ ...value, songSlug: slug })), `${slug}: exhaustive finding not merged`);
    }
  }
  console.log(`appearance dataset ${dataset.items.length} items`);
  console.log("exhaustive song appearance dataset passed");
}

const explicitScreenUse = /(영화|드라마|애니메이션|애니|movie|film|drama|anime).{0,60}(삽입곡|주제가|오프닝|엔딩|사운드트랙|OST|theme song|insert song|opening|ending)|(?:삽입곡|주제가|오프닝|엔딩|사운드트랙|OST|theme song|insert song|opening|ending).{0,60}(?:영화|드라마|애니메이션|애니|movie|film|drama|anime)/i;
const coverOnlyClue = /(주제가를|theme song).{0,30}(다시 부른|커버|cover)|(?:다시 부른|커버|cover).{0,30}(?:주제가|theme song)/i;
const fixedPositiveControls = new Set([
  "10-feet-第ゼロ感",
  "l-arc-en-ciel-浸食-lose-control",
  "stratovarius-forever",
]);

function positiveControls() {
  const required = songs.filter((song) => fixedPositiveControls.has(song.slug) || (explicitScreenUse.test(song.comment) && !coverOnlyClue.test(song.comment)));
  const appeared = new Set(dataset.items.map((item) => item.songSlug));
  assert.ok(required.length >= fixedPositiveControls.size, "positive control discovery failed");
  for (const song of required) assert.ok(appeared.has(song.slug), `${song.slug}: explicit screen-use clue has no verified appearance`);
  console.log(`positive controls ${required.length} songs`);
  console.log("exhaustive song appearance positive controls passed");
}

async function production() {
  const site = "https://lyracyno.vercel.app";
  const versionResponse = await fetch(`${site}/api/version`, { cache: "no-store" });
  assert.equal(versionResponse.status, 200);
  const version = await versionResponse.json();
  assert.equal(version.contentStore, "neon");
  assert.equal(version.contentFallback, false);
  assert.match(String(version.deploymentId || ""), /^dpl_/);
  const baselineIds = new Set((audit.baseline || []).map((item) => item.id));
  const added = dataset.items.filter((item) => !baselineIds.has(item.id) && item.status === "verified");
  assert.ok(added.length >= 2, "fewer than two newly verified appearances reached the dataset");
  for (const item of added.slice(0, 3)) {
    const response = await fetch(`${site}/songs/${encodeURIComponent(item.songSlug)}`, { cache: "no-store" });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /data-song-appearances/);
    assert.ok(html.includes(item.workTitle), `production page does not include ${item.workTitle}`);
  }
  console.log(`production probes ${Math.min(3, added.length)} · new appearances ${added.length}`);
  console.log("production exhaustive song appearance verification passed");
}

if (args.has("--coverage")) coverage();
else if (args.has("--evidence")) evidence();
else if (args.has("--dataset")) datasetCheck();
else if (args.has("--positive-controls")) positiveControls();
else if (args.has("--production")) await production();
else {
  coverage();
  evidence();
  datasetCheck();
  positiveControls();
}
