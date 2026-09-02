// Official song artwork audit.
//   node scripts/audit-song-artwork.mjs --local       structural catalog audit
//   node scripts/audit-song-artwork.mjs --remote-all  verify every unique image response
//   node scripts/audit-song-artwork.mjs --production  verify corrected production pages/images
//   node scripts/audit-song-artwork.mjs --self-test   prove negative controls are rejected
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getAllSongs } from "../lib/songs.js";
import { artistMatches, titleMatch } from "../lib/admin/match.js";

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
  ["kenshi-yonezu-地球儀", "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/45/5a/c9/455ac9fc-e38b-09c2-7e8f-79beeca04375/4547366634242.jpg/600x600bb.jpg"],
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
// coverartarchive.org가 리다이렉트하는 실제 저장 노드. 아카이브가 아이템을 다른
// 노드로 옮기면 이 주소는 죽는다 — 리다이렉트 결과가 아니라 안정 주소를 저장해야 한다.
const UNSTABLE_ARCHIVE_NODE = /^(?:dn\d+\.ca|ia\d+\.us)\.archive\.org$/;

export function validateSongs(songs) {
  const issues = [];
  const byArtwork = new Map();
  for (const song of songs) {
    if (song.artwork_none) issues.push({ code: "artwork-none", slug: song.slug });
    let url;
    try { url = new URL(song.artwork); } catch { issues.push({ code: "missing-or-invalid", slug: song.slug }); continue; }
    if (url.protocol !== "https:") issues.push({ code: "not-https", slug: song.slug });
    if (!trustedHost(url.hostname)) issues.push({ code: "untrusted-source", slug: song.slug, host: url.hostname });
    if (UNSTABLE_ARCHIVE_NODE.test(url.hostname)) issues.push({ code: "unstable-archive-node", slug: song.slug, host: url.hostname });
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

const LOOKUP_CHUNK = 150; // iTunes lookup은 최대 200개 id를 한 번에 받는다 — 여유를 둔다
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// country 없이 조회하면 US 스토어가 기본이라 한국 아티스트도 로마자 표기("Kim Jong Seo")로
// 돌아온다. 우리 기록은 KR/JP 스토어에서 원어 표기로 채워졌으므로(meta-backfill의
// storeOrder), 같은 트랙이어도 스토어가 다르면 문자열이 안 맞아 대량 오탐이 났다.
// 세 스토어를 순서대로 물어 그중 하나라도 맞으면 통과 — 실제로 다른 트랙일 때만 셋 다 실패한다.
const STORES = ["KR", "JP", "US"];

async function lookupBatch(ids, country) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + LOOKUP_CHUNK);
    const res = await fetch(`https://itunes.apple.com/lookup?id=${chunk.join(",")}&country=${country}`, {
      headers: { "User-Agent": "LyraArtworkAudit/1.0" },
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    if (!res.ok || !/^\s*\{/.test(text)) throw new Error(`lookup batch failed (${res.status}, ${country}): ${text.slice(0, 120)}`);
    const json = JSON.parse(text);
    for (const r of json.results || []) {
      if (r.trackId && (r.wrapperType === "track" || r.kind === "song")) out.set(String(r.trackId), r);
    }
    if (i + LOOKUP_CHUNK < ids.length) await sleep(1200);
  }
  return out;
}

const matchesSong = (track, song) => artistMatches(track.artistName, song.artist) && titleMatch(track.trackName, song.title) !== "reject";

// 구조 검사(untrusted-source·cross-release-duplicate)는 "신뢰 호스트에 고유 URL인가"만
// 묻는다 — 그 URL이 진짜 이 곡 것인지는 안 묻는다. 여기서는 저장된 trackId를 iTunes에
// 되물어, 돌아온 곡명·아티스트가 우리 기록과 맞는지 직접 대조한다. 안 맞으면 애초에
// 다른 곡의 트랙을 붙인 것 — "잘못된 커버"의 결정적 증거다. lookup은 최대 200개 id를
// 한 번에 받으므로 767곡도 몇 번의 요청으로 끝난다(요청 사이 1.2초 페이싱).
export async function matchAudit(songs = getAllSongs()) {
  const withId = songs.filter((s) => /^\d+$/.test(String(s.trackId || "").trim()));
  let pending = [...new Set(withId.map((s) => String(s.trackId).trim()))];
  const byStore = new Map(); // trackId -> { KR: track|undefined, JP: ..., US: ... }
  for (const country of STORES) {
    if (!pending.length) break;
    const found = await lookupBatch(pending, country);
    for (const id of pending) {
      if (!byStore.has(id)) byStore.set(id, {});
      byStore.get(id)[country] = found.get(id) || null;
    }
    // 이번 스토어에서 이미 맞은 곡의 trackId는 다음 스토어에서 다시 안 묻는다
    const solvedIds = new Set(
      withId.filter((s) => { const t = found.get(String(s.trackId).trim()); return t && matchesSong(t, s); })
        .map((s) => String(s.trackId).trim())
    );
    pending = pending.filter((id) => !solvedIds.has(id));
  }

  const issues = [];
  for (const song of withId) {
    const id = String(song.trackId).trim();
    const attempts = byStore.get(id) || {};
    const tracks = STORES.map((c) => attempts[c]).filter(Boolean);
    if (tracks.some((t) => matchesSong(t, song))) continue; // 세 스토어 중 하나라도 맞으면 통과
    if (!tracks.length) { issues.push({ code: "trackid-delisted", slug: song.slug, trackId: id }); continue; }
    const best = tracks[0];
    issues.push({
      code: "trackid-mismatch", slug: song.slug, trackId: id,
      expected: `${song.artist} - ${song.title}`, found: `${best.artistName} - ${best.trackName}`,
    });
  }

  // 같은 trackId가 서로 다른 곡 두 개에 붙어 있으면 적어도 하나는 잘못 배정된 것이다 —
  // API 응답과 무관하게 판단할 수 있는 값이라 항상 함께 확인한다.
  const byId = new Map();
  for (const song of withId) {
    const id = String(song.trackId).trim();
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(song.slug);
  }
  for (const [id, slugs] of byId) if (slugs.length > 1) issues.push({ code: "trackid-shared", trackId: id, slugs });

  return { checked: withId.length, withoutTrackId: songs.length - withId.length, issues };
}

async function matchAuditRun() {
  const songs = getAllSongs();
  const { checked, withoutTrackId, issues } = await matchAudit(songs);
  const bySlug = new Map();
  for (const issue of issues) for (const slug of issue.slugs || [issue.slug]) {
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(issue);
  }
  fs.mkdirSync(".backfill", { recursive: true });
  fs.writeFileSync(
    ".backfill/artwork-mismatch-report.json",
    JSON.stringify({ at: new Date().toISOString(), checked, withoutTrackId, issues }, null, 1)
  );
  console.log(`trackId 보유 ${checked}곡 확인 · trackId 없음 ${withoutTrackId}곡(별도 검토 대상)`);
  console.log(`불일치 의심 ${bySlug.size}곡`);
  for (const [slug, list] of bySlug) {
    for (const issue of list) {
      if (issue.code === "trackid-mismatch") console.log(`  ✗ ${slug}: 기대 "${issue.expected}" ↔ 실제 "${issue.found}" (trackId ${issue.trackId})`);
      else if (issue.code === "trackid-delisted") console.log(`  ? ${slug}: trackId ${issue.trackId} 조회 안 됨(내려간 트랙)`);
      else if (issue.code === "trackid-shared") console.log(`  ⚠ ${slug}: trackId ${issue.trackId}를 ${issue.slugs.length}곡이 공유 (${issue.slugs.join(", ")})`);
    }
  }
  console.log(`\n리포트: .backfill/artwork-mismatch-report.json`);
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
  else if (mode === "--match-audit") await matchAuditRun();
  else if (mode === "--self-test") selfTest();
  else throw new Error(`unknown mode: ${mode}`);
}
