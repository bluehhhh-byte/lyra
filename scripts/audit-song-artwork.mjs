// Official song artwork audit.
//   node scripts/audit-song-artwork.mjs --local       structural catalog audit
//   node scripts/audit-song-artwork.mjs --remote-all  verify every unique image response
//   node scripts/audit-song-artwork.mjs --production  verify corrected production pages/images
//   node scripts/audit-song-artwork.mjs --self-test   prove negative controls are rejected
import { fileURLToPath } from "node:url";
import { getAllSongs } from "../lib/songs.js";

const TRUSTED_HOSTS = new Set([
  "is1-ssl.mzstatic.com",
  "cdn-images.dzcdn.net",
  "image.bugsm.co.kr",
  "coverartarchive.org",
  "i.scdn.co",
  "image.genie.co.kr",
  "i1.sndcdn.com",
  "i.ytimg.com",
]);

export const CORRECTED_ARTWORK = Object.freeze([
  ["hu57la-내-모든-것", "https://i.ytimg.com/vi/GJcmMbvY3jo/maxresdefault.jpg"],
  ["스카이민혁-촛불", "https://i1.sndcdn.com/artworks-LE1txAv9Q3yYwJLT-5aJ88g-t500x500.jpg"],
  ["프리즘-모험아이", "https://image.bugsm.co.kr/album/images/1200/77/7776.jpg"],
  ["malice-mizer-虛無の中での遊戱", "https://coverartarchive.org/release-group/6059578c-6dcf-36f0-bda3-9f7d9f65b305/front-500"],
  ["spitz-spider", "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/9a/26/3b/9a263bc6-cebd-04df-c362-2a0868d277dd/00602557728743.rgb.jpg/600x600bb.jpg"],
  ["spitz-cherry", "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/29/c0/30/29c030c7-ae9c-a201-ef47-bf9a8b2ed31a/00600406212191.rgb.jpg/600x600bb.jpg"],
  ["spitz-robinson", "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/d2/b2/da/d2b2dadb-068a-6641-ee96-9a3150906cbe/00600406212184.rgb.jpg/600x600bb.jpg"],
  ["radiohead-palo-alto", "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/33/16/c9/3316c9c7-aa51-f101-c06d-502ab58bdd20/634904080563.png/600x600bb.jpg"],
  ["jtl-행복했던-기억들은", "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/19/c2/e4/19c2e47c-2038-d711-5bed-9509ff28fa1d/25921_cover.png/600x600bb.jpg"],
  ["jtl-without-your-love", "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/68/53/5a/68535ac7-0e87-4517-bd1c-1da361c17434/32416_cover.png/600x600bb.jpg"],
  ["jtl-a-better-day", "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/35/f9/5c/35f95c50-6546-7239-631e-cf506a5c63c9/14900.jpg/600x600bb.jpg"],
]);

const normalizedAlbum = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]/g, "");
const trustedHost = (hostname) => TRUSTED_HOSTS.has(hostname) || hostname.endsWith(".archive.org") || /^ia\d+\.us\.archive\.org$/.test(hostname);

export function validateSongs(songs) {
  const issues = [];
  const byArtwork = new Map();
  for (const song of songs) {
    if (song.artwork_none) issues.push({ code: "artwork-none", slug: song.slug });
    let url;
    try { url = new URL(song.artwork); } catch { issues.push({ code: "missing-or-invalid", slug: song.slug }); continue; }
    if (url.protocol !== "https:") issues.push({ code: "not-https", slug: song.slug });
    if (!trustedHost(url.hostname)) issues.push({ code: "untrusted-source", slug: song.slug, host: url.hostname });
    if (!byArtwork.has(song.artwork)) byArtwork.set(song.artwork, []);
    byArtwork.get(song.artwork).push(song);
  }

  for (const group of byArtwork.values()) {
    const trackIds = new Set(group.map((song) => String(song.trackId || "")).filter(Boolean));
    const albums = new Set(group.map((song) => normalizedAlbum(song.album)).filter(Boolean));
    if (trackIds.size > 1 && albums.size > 1) {
      issues.push({ code: "cross-release-duplicate", slugs: group.map((song) => song.slug), albums: [...albums] });
    }
  }
  return issues;
}

async function fetchImage(url, timeout = 30000) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "LyraArtworkAudit/1.0", Range: "bytes=0-2047" },
    signal: AbortSignal.timeout(timeout),
  });
  const type = response.headers.get("content-type") || "";
  if (!response.ok || (!type.startsWith("image/") && type !== "application/octet-stream")) {
    throw new Error(`${response.status} ${type || "no-content-type"}`);
  }
  await response.body?.cancel();
  return { status: response.status, type };
}

async function pooled(items, worker, concurrency = 20) {
  const failures = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { await worker(items[index], index); } catch (error) { failures.push({ item: items[index], error: error.message }); }
    }
  }));
  return failures;
}

async function localAudit() {
  const songs = getAllSongs();
  const issues = validateSongs(songs);
  if (issues.length) throw new Error(`artwork issues (${issues.length}): ${JSON.stringify(issues.slice(0, 20))}`);
  if (songs.length < 900) throw new Error(`song corpus unexpectedly small: ${songs.length}`);
  console.log(`${songs.length} songs · ${new Set(songs.map((song) => song.artwork)).size} unique covers`);
  console.log("local artwork audit passed");
}

async function remoteAllAudit() {
  await localAudit();
  const urls = [...new Set(getAllSongs().map((song) => song.artwork))];
  const failures = await pooled(urls, async (url) => fetchImage(url), 24);
  if (failures.length) throw new Error(`unreachable artwork (${failures.length}): ${JSON.stringify(failures.slice(0, 20))}`);
  console.log(`${urls.length} unique artwork responses verified`);
  console.log("remote artwork audit passed");
}

async function productionAudit() {
  await localAudit();
  const base = "https://lyracyno.vercel.app";
  const failures = await pooled(CORRECTED_ARTWORK, async ([slug, artwork]) => {
    const response = await fetch(`${base}/songs/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`page ${response.status}`);
    const html = await response.text();
    const fingerprint = artwork.split("/").at(-2) || artwork.split("/").at(-1);
    if (!html.includes(fingerprint)) throw new Error(`page does not contain ${fingerprint}`);
    await fetchImage(artwork, 45000);
  }, 8);
  if (failures.length) throw new Error(`production failures (${failures.length}): ${JSON.stringify(failures)}`);
  console.log(`${CORRECTED_ARTWORK.length} corrected production pages and images verified`);
  console.log("production artwork audit passed");
}

function selfTest() {
  const good = { slug: "good", artwork: "https://is1-ssl.mzstatic.com/image/good.jpg", album: "Good", trackId: "1" };
  if (validateSongs([good]).length) throw new Error("positive fixture failed");
  const issues = validateSongs([
    good,
    { slug: "missing", artwork: "", artwork_none: true },
    { slug: "fan-art", artwork: "https://example.com/fan.jpg" },
    { slug: "wrong-a", artwork: good.artwork, album: "Other", trackId: "2" },
  ]);
  for (const code of ["artwork-none", "missing-or-invalid", "untrusted-source", "cross-release-duplicate"]) {
    if (!issues.some((issue) => issue.code === code)) throw new Error(`negative control not rejected: ${code}`);
  }
  console.log("artwork audit self-test passed");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`))) {
  const mode = process.argv[2] || "--local";
  if (mode === "--local") await localAudit();
  else if (mode === "--remote-all") await remoteAllAudit();
  else if (mode === "--production") await productionAudit();
  else if (mode === "--self-test") selfTest();
  else throw new Error(`unknown mode: ${mode}`);
}
