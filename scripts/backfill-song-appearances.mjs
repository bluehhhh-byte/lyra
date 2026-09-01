// Grounded, resumable screen-appearance research for the complete song corpus.
//
//   node scripts/backfill-song-appearances.mjs --all
//   node scripts/backfill-song-appearances.mjs --screen --limit=24
//   node scripts/backfill-song-appearances.mjs --verify --limit=10
//   node scripts/backfill-song-appearances.mjs --import-curated
//   node scripts/backfill-song-appearances.mjs --merge
//
// Screening is deliberately high-recall and batched. Every candidate is then
// researched alone, so one song's source can never silently prove another
// song's claim. Only URLs returned in Gemini's grounding metadata are saved.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { getAllSongs } from "../lib/songs.js";
import {
  APPEARANCE_ROLES,
  WORK_TYPES,
  appearanceIdentity,
  normalizeAppearance,
  normalizeAppearanceData,
} from "../lib/song-appearances.js";
import { geminiGrounded, GEMINI_LITE_MODEL, lastGeminiError } from "../lib/admin/gemini.js";

dotenv.config({ path: ".env.local", override: false, quiet: true });

const root = process.cwd();
const legacyAuditFile = path.join(root, "data", "song-appearance-backfill.json");
const curatedFile = path.join(root, "data", "song-appearance-curated.json");
const datasetFile = path.join(root, "data", "song-appearances.json");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const numberArg = (name, fallback) => {
  const raw = args.find((arg) => arg.startsWith(`--${name}=`));
  const value = raw ? Number(raw.slice(name.length + 3)) : fallback;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};
const EXHAUSTIVE_SCREEN = flag("exhaustive-screen");
const EXHAUSTIVE = flag("exhaustive") || EXHAUSTIVE_SCREEN;
const auditFile = path.join(root, "data", EXHAUSTIVE ? "song-appearance-exhaustive.json" : "song-appearance-backfill.json");
const SCREEN = flag("all") || flag("screen");
const VERIFY = flag("all") || flag("verify") || EXHAUSTIVE;
const MERGE = flag("all") || flag("merge");
const IMPORT_CURATED = flag("all") || flag("import-curated");
const RESCORE = flag("rescore");
const RESET = flag("reset");
const LIMIT = numberArg("limit", Infinity);
const SLUG = String((args.find((arg) => arg.startsWith("--slug=")) || "--slug=").slice(7));
const BATCH_SIZE = Math.max(1, Math.min(10, numberArg("batch-size", 6)));
const DELAY_MS = numberArg("delay-ms", 4200);
const MAX_ATTEMPTS = Math.max(1, Math.min(5, numberArg("attempts", 3)));
const PROVIDER = String((args.find((arg) => arg.startsWith("--provider=")) || "--provider=gemini").slice(11));
const key = process.env.GEMINI_API_KEY;

if (!SCREEN && !VERIFY && !MERGE && !RESCORE && !IMPORT_CURATED && !EXHAUSTIVE_SCREEN) {
  console.error("usage: node scripts/backfill-song-appearances.mjs --all|--exhaustive|--exhaustive-screen|--screen|--verify|--import-curated|--merge|--rescore [--limit=N] [--slug=SLUG]");
  process.exit(2);
}
if ((SCREEN || VERIFY) && !key) throw new Error("GEMINI_API_KEY가 없습니다.");

const songs = getAllSongs().map((song) => ({
  slug: String(song.slug),
  title: String(song.title || ""),
  titleKo: String(song.titleKo || song.title_ko || ""),
  artist: String(song.artist || ""),
  album: String(song.album || ""),
  year: Number(song.year) || null,
  genre: String(song.genre || ""),
  tags: Array.isArray(song.tags) ? song.tags.map(String) : [],
  comment: String(song.comment || ""),
})).sort((a, b) => a.slug.localeCompare(b.slug));
const songBySlug = new Map(songs.map((song) => [song.slug, song]));
const dataset = normalizeAppearanceData(JSON.parse(fs.readFileSync(datasetFile, "utf8")));
const existingBySong = new Map();
for (const item of dataset.items) {
  const list = existingBySong.get(item.songSlug) || [];
  list.push(item);
  existingBySong.set(item.songSlug, list);
}

const digest = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const corpusDigest = digest(songs.map(({ slug, title, artist, album, year }) => ({ slug, title, artist, album, year })));
const itemDigest = (item) => digest(JSON.stringify(item));
const now = () => new Date().toISOString();
const sleep = (ms) => ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
const sourceShape = (source) => ({ uri: String(source?.uri || ""), title: String(source?.title || "웹 검색 결과") });
const jsonObject = (value) => {
  const text = String(value || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
};
const writeJsonAtomic = (file, value) => {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
};
const saveAudit = () => {
  audit.updatedAt = now();
  writeJsonAtomic(auditFile, audit);
};

const legacyAudit = EXHAUSTIVE && fs.existsSync(legacyAuditFile)
  ? JSON.parse(fs.readFileSync(legacyAuditFile, "utf8"))
  : null;
const legacyBatchBySlug = new Map();
for (const batch of legacyAudit?.screeningBatches || []) {
  for (const slug of batch.slugs || []) legacyBatchBySlug.set(String(slug), batch);
}
const exhaustiveResults = () => Object.fromEntries(songs.map((song) => {
  const legacy = legacyAudit?.results?.[song.slug];
  const batch = legacyBatchBySlug.get(song.slug);
  return [song.slug, {
    status: "pending",
    phase: "exhaustive",
    passes: [{
      provider: "legacy-bing-untrusted",
      status: legacy?.status || "unknown",
      queries: (batch?.queries || legacy?.queries || []).map(String),
      sources: (batch?.sources || legacy?.sources || []).map(sourceShape),
      researchedAt: batch?.researchedAt || legacy?.updatedAt || null,
    }],
    updatedAt: now(),
  }];
}));

let audit = !RESET && fs.existsSync(auditFile)
  ? JSON.parse(fs.readFileSync(auditFile, "utf8"))
  : {
      version: EXHAUSTIVE ? 2 : 1,
      createdAt: now(),
      updatedAt: now(),
      corpusDigest,
      totalSongs: songs.length,
      baseline: dataset.items.map((item) => ({ id: item.id, identity: appearanceIdentity(item), digest: itemDigest(item) })),
      screeningBatches: [],
      results: EXHAUSTIVE ? exhaustiveResults() : {},
    };

if (audit.corpusDigest !== corpusDigest || audit.totalSongs !== songs.length) {
  throw new Error(`곡 목록이 감사 시작 이후 바뀌었습니다. 기존 ${audit.totalSongs}곡, 현재 ${songs.length}곡. 검토 후 --reset을 사용하세요.`);
}
audit.results ||= {};
audit.screeningBatches ||= [];

const cluePattern = /(영화|드라마|애니메이션|애니|삽입곡|주제가|오프닝|엔딩|사운드트랙|\bOST\b|soundtrack|theme song|opening|ending|insert song)/i;
const forcedCandidate = (song) => cluePattern.test(`${song.comment} ${song.genre} ${song.tags.join(" ")}`);

async function grounded(prompt) {
  const result = await geminiGrounded(key, prompt, GEMINI_LITE_MODEL);
  if (!result?.text) return null;
  return { ...result, sources: (result.sources || []).map(sourceShape) };
}

async function screenBatch(batch) {
  const payload = batch.map(({ slug, title, titleKo, artist, album, year }) => ({ slug, title, titleKo, artist, album, year }));
  const prompt = `Use Google Search to screen each exact recording below for documented use in a movie, live-action TV drama, theatrical anime, or TV anime.
High recall matters: search title + artist with soundtrack, OST, theme song, insert song, opening, ending, tie-up, 主題歌, 挿入歌, 映画, ドラマ, アニメ. Match both title and recording artist; do not confuse covers or same-title songs. Exclude games, commercials, music videos, and fan playlists unless the same source also explicitly documents a supported screen work.

Return JSON only: {"candidates":[{"slug":"exact supplied slug","reason":"short factual clue"}]}. Include only songs with a plausible documented screen connection; an empty array is valid.
Songs:
${JSON.stringify(payload)}`;
  const result = await grounded(prompt);
  if (!result || !(result.queries || []).length) return null;
  let parsed;
  try { parsed = jsonObject(result.text); } catch { return null; }
  if (!Array.isArray(parsed?.candidates)) return null;
  const allowed = new Set(batch.map((song) => song.slug));
  const candidates = parsed.candidates
    .map((item) => ({ slug: String(item?.slug || ""), reason: String(item?.reason || "").slice(0, 400) }))
    .filter((item) => allowed.has(item.slug));
  return { candidates, sources: result.sources, queries: result.queries.map(String) };
}

const decodeHtml = (value) => String(value || "")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const stripHtml = (value) => decodeHtml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const screenTerms = /\b(soundtrack|ost|theme song|opening|ending|insert song|movie|film|drama|anime)\b|主題歌|挿入歌|劇中歌|映画|ドラマ|アニメ|삽입곡|주제가|오프닝|엔딩|영화|드라마|애니메이션/i;
const isCandidateSource = (source, song) => {
  const haystackText = `${source.title} ${source.snippet || ""} ${source.uri}`;
  const haystack = token(haystackText);
  const artistToken = token(song.artist);
  const titleToken = token(song.title.replace(/\([^)]*\)|\[[^\]]*\]/g, ""));
  const artistMatch = artistToken.length < 4 || haystack.includes(artistToken);
  const titleMatch = titleToken.length < 4 || haystack.includes(titleToken);
  return screenTerms.test(haystackText) && artistMatch && titleMatch;
};

async function duckSearch(song) {
  const query = `"${song.artist}" "${song.title}" soundtrack OST theme song insert song movie drama anime 主題歌 挿入歌 映画 ドラマ アニメ 주제가 삽입곡 영화 드라마 애니`;
  const response = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return null;
  const html = await response.text();
  if (/anomaly-modal|bots use DuckDuckGo|challenge-form/i.test(html)) return null;
  const anchors = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const sources = anchors.slice(0, 10).map((match, index) => {
    const start = match.index + match[0].length;
    const end = anchors[index + 1]?.index || Math.min(html.length, start + 4000);
    const block = html.slice(start, end);
    const snippet = (block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>/) || []);
    let uri = decodeHtml(match[1]);
    try {
      const url = new URL(uri, "https://duckduckgo.com");
      uri = url.searchParams.get("uddg") || url.href;
    } catch {}
    return { uri, title: stripHtml(match[2]), snippet: stripHtml(snippet[1] || snippet[2]) };
  }).filter((source) => /^https?:\/\//i.test(source.uri));
  if (!sources.length) return null;
  const candidateSources = sources.filter((source) => isCandidateSource(source, song));
  return { query, sources, candidateSources };
}

async function runExhaustiveScreening() {
  const pending = songs.filter((song) => {
    if (SLUG && song.slug !== SLUG) return false;
    return !(audit.results[song.slug]?.passes || []).some((pass) => pass.provider === "duckduckgo");
  }).slice(0, LIMIT);
  console.log(`exhaustive DuckDuckGo screening ${pending.length} songs`);
  for (let index = 0; index < pending.length; index++) {
    const song = pending[index];
    let screened = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !screened; attempt++) {
      try { screened = await duckSearch(song); } catch {}
      if (!screened && attempt < MAX_ATTEMPTS) await sleep(DELAY_MS);
    }
    const previous = audit.results[song.slug] || { passes: [] };
    if (!screened) {
      audit.results[song.slug] = {
        ...previous, status: "retryable", phase: "screen", attempts: MAX_ATTEMPTS,
        reason: "DuckDuckGo screening returned no parseable results", updatedAt: now(),
      };
      console.log(`  retryable ${song.artist} — ${song.title}`);
    } else {
      const sources = screened.sources.map((source) => ({ uri: source.uri, title: source.title, snippet: source.snippet }));
      audit.results[song.slug] = {
        ...previous,
        status: "pending",
        phase: "exhaustive",
        screeningCandidate: screened.candidateSources.length > 0 || forcedCandidate(song),
        screeningSources: screened.candidateSources.map((source) => source.uri),
        passes: [
          ...(previous.passes || []).filter((pass) => pass.provider !== "duckduckgo"),
          { provider: "duckduckgo", status: "complete", queries: [screened.query], sources, researchedAt: now() },
        ],
        updatedAt: now(),
      };
      console.log(`  ${index + 1}/${pending.length} · ${audit.results[song.slug].screeningCandidate ? "candidate" : "no clue"} · ${song.artist} — ${song.title}`);
    }
    saveAudit();
    if (index + 1 < pending.length) await sleep(DELAY_MS);
  }
}

async function bingSearch(song) {
  const query = `"${song.artist}" "${song.title}" soundtrack OR OST OR "theme song" OR "insert song" OR 主題歌 OR 挿入歌`;
  const response = await fetch(`https://www.bing.com/search?format=rss&count=10&q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LyraPersonalArchive/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return null;
  const xml = await response.text();
  const sources = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10).map((match) => {
    const block = match[1];
    return {
      uri: stripHtml((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1]),
      title: stripHtml((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]),
      snippet: stripHtml((block.match(/<description>([\s\S]*?)<\/description>/) || [])[1]),
    };
  }).filter((source) => /^https?:\/\//i.test(source.uri));
  if (!sources.length) return null;
  const candidateSources = sources.filter((source) => isCandidateSource(source, song));
  return { query, sources, candidateSources };
}

async function runScreening() {
  const pending = songs.filter((song) => !audit.results[song.slug] || audit.results[song.slug].status === "retryable" && audit.results[song.slug].phase === "screen");
  const selected = pending.slice(0, LIMIT);
  if (PROVIDER === "duckduckgo" || PROVIDER === "bing") {
    console.log(`screening ${selected.length}/${pending.length} songs · ${PROVIDER} direct search`);
    for (let index = 0; index < selected.length; index++) {
      const song = selected[index];
      let screened = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !screened; attempt++) {
        try { screened = PROVIDER === "bing" ? await bingSearch(song) : await duckSearch(song); } catch {}
        if (!screened && attempt < MAX_ATTEMPTS) await sleep(DELAY_MS);
      }
      if (!screened) {
        audit.results[song.slug] = {
          status: "retryable", phase: "screen", attempts: MAX_ATTEMPTS,
          reason: `${PROVIDER} screening returned no parseable search results`, updatedAt: now(),
        };
        console.log(`  retryable ${song.slug}`);
      } else {
        const batchId = `${PROVIDER}-${audit.screeningBatches.length + 1}`;
        const candidate = screened.candidateSources.length > 0 || forcedCandidate(song);
        audit.screeningBatches.push({
          id: batchId, slugs: [song.slug], queries: [screened.query], sources: screened.sources,
          candidateSources: screened.candidateSources.map((source) => source.uri), researchedAt: now(),
        });
        audit.results[song.slug] = candidate
          ? { status: "screened_candidate", phase: "verify", batchId, reason: forcedCandidate(song) ? "existing metadata contains a screen-use clue" : "screen-use search result matched song metadata", updatedAt: now() }
          : existingBySong.has(song.slug)
            ? { status: "existing_verified", phase: "complete", batchId, existingIds: existingBySong.get(song.slug).map((item) => item.id), updatedAt: now() }
            : { status: "no_match", phase: "complete", batchId, updatedAt: now() };
        console.log(`  ${index + 1}/${selected.length} · ${candidate ? "candidate" : "no match"} · ${song.artist} — ${song.title}`);
      }
      saveAudit();
      if (index + 1 < selected.length) await sleep(DELAY_MS);
    }
    return;
  }
  console.log(`screening ${selected.length}/${pending.length} songs · batch ${BATCH_SIZE}`);
  for (let offset = 0; offset < selected.length; offset += BATCH_SIZE) {
    const batch = selected.slice(offset, offset + BATCH_SIZE);
    let screened = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !screened; attempt++) {
      screened = await screenBatch(batch);
      if (!screened && attempt < MAX_ATTEMPTS) await sleep(DELAY_MS);
    }
    const batchId = `screen-${audit.screeningBatches.length + 1}`;
    if (!screened) {
      for (const song of batch) audit.results[song.slug] = {
        status: "retryable", phase: "screen", attempts: MAX_ATTEMPTS,
        reason: lastGeminiError || "grounded screening returned no complete search result", updatedAt: now(),
      };
      console.log(`  retryable ${batch.map((song) => song.slug).join(", ")}`);
    } else {
      const candidateReasons = new Map(screened.candidates.map((item) => [item.slug, item.reason]));
      audit.screeningBatches.push({ id: batchId, slugs: batch.map((song) => song.slug), queries: screened.queries, sources: screened.sources, researchedAt: now() });
      for (const song of batch) {
        const candidate = candidateReasons.has(song.slug) || forcedCandidate(song);
        const hasExisting = existingBySong.has(song.slug);
        audit.results[song.slug] = candidate
          ? { status: "screened_candidate", phase: "verify", batchId, reason: candidateReasons.get(song.slug) || "existing metadata contains a screen-use clue", updatedAt: now() }
          : hasExisting
            ? { status: "existing_verified", phase: "complete", batchId, existingIds: existingBySong.get(song.slug).map((item) => item.id), updatedAt: now() }
            : { status: "no_match", phase: "complete", batchId, updatedAt: now() };
      }
      console.log(`  ${offset + batch.length}/${selected.length} · candidates ${batch.filter((song) => candidateReasons.has(song.slug) || forcedCandidate(song)).length}`);
    }
    saveAudit();
    if (offset + BATCH_SIZE < selected.length) await sleep(DELAY_MS);
  }
}

const token = (value) => String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]/g, "");
const sameUrl = (a, b) => String(a || "").replace(/\/$/, "") === String(b || "").replace(/\/$/, "");
const sourceScore = (source, song, appearance) => {
  const haystack = token(`${source.title} ${source.uri}`);
  let score = 0;
  for (const value of [song.title, song.artist, appearance.workTitle, appearance.originalTitle]) {
    const needle = token(value);
    if (needle && haystack.includes(needle)) score += 4;
  }
  if (/official|공식|オフィシャル|soundtrack|ost|music|movie|film|anime|drama/i.test(`${source.title} ${source.uri}`)) score += 2;
  if (/reddit|pinterest|fandom|blogspot/i.test(source.uri)) score -= 5;
  return score;
};
const optionalInteger = (value) => {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};
const clean = (value, max = 500) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

async function researchOne(song) {
  const prompt = `Use Google Search to exhaustively verify whether the exact recording "${song.title}" by ${song.artist} was used in any movie, live-action TV drama, theatrical anime, or TV anime.
Search title variants and combine title + artist with soundtrack, OST, theme song, insert song, opening, ending, tie-up, 主題歌, 挿入歌, 映画, ドラマ, アニメ. Check official artist, label, production/distributor/broadcaster pages and reliable music/film publications first. Match both song and recording artist. Do not transfer facts from a cover, remake, another artist, or a same-title song. Exclude games, commercials, music videos, stage works, and fan playlists. A soundtrack album listing is valid only when the exact recording appears on it.

Return every separately documented supported work, up to 8. Preserve the source's role: main_theme, opening, ending, insert_song, background, trailer, character_song, or other. workType must be movie, drama, anime_movie, or anime_series. Do not turn 'soundtrack listing' into 'theme song' or 'insert song' unless the source says so; use background or other with a clear note.

Return JSON only:
{"found":true,"appearances":[{"workTitle":"Korean title when established, otherwise source title","originalTitle":"","workType":"movie","role":"insert_song","year":2020,"season":null,"episode":null,"note":"brief evidence-aligned detail","evidenceUrl":"the direct URL actually used"}]}
If no supported screen use is found after searching, return {"found":false,"appearances":[]}.

Song metadata: ${JSON.stringify(song)}`;
  const result = await grounded(prompt);
  if (!result || !(result.queries || []).length) return null;
  let parsed;
  try { parsed = jsonObject(result.text); } catch { return null; }
  const values = Array.isArray(parsed?.appearances) ? parsed.appearances : [];
  if (parsed?.found !== true && values.length === 0) return { found: false, appearances: [], sources: result.sources, queries: result.queries };
  if (!result.sources.length || !values.length) return null;

  const appearances = [];
  for (const value of values.slice(0, 8)) {
    if (!value?.workTitle || !Object.hasOwn(WORK_TYPES, value.workType) || !Object.hasOwn(APPEARANCE_ROLES, value.role)) continue;
    const requested = clean(value.evidenceUrl, 1500);
    const source = result.sources.find((item) => sameUrl(item.uri, requested)) ||
      [...result.sources].sort((a, b) => sourceScore(b, song, value) - sourceScore(a, song, value))[0];
    if (!source?.uri || !/^https?:\/\//i.test(source.uri)) continue;
    const workType = value.workType;
    appearances.push({
      workTitle: clean(value.workTitle, 200), originalTitle: clean(value.originalTitle, 200), workType,
      mediaType: workType === "drama" || workType === "anime_series" ? "tv" : "movie",
      tmdbId: null, localMovieSlug: "", year: optionalInteger(value.year), poster: "",
      role: value.role, season: optionalInteger(value.season), episode: optionalInteger(value.episode),
      evidenceUrl: source.uri, evidenceLabel: clean(source.title, 100), status: "verified", note: clean(value.note, 500),
    });
  }
  return appearances.length ? { found: true, appearances, sources: result.sources, queries: result.queries } : null;
}

let tmdbTools = null;
async function enrichTmdb(value) {
  if (!process.env.TMDB_API_KEY) return value;
  try {
    tmdbTools ||= await import("../lib/tmdb.js");
    const results = await tmdbTools.searchMovies(value.workTitle || value.originalTitle);
    const wanted = new Set([token(value.workTitle), token(value.originalTitle)].filter(Boolean));
    const match = results.find((item) =>
      (wanted.has(token(item.title)) || wanted.has(token(item.originalTitle))) &&
      (!value.year || !item.year || Math.abs(Number(item.year) - Number(value.year)) <= 1)
    );
    if (!match) return value;
    const detail = await tmdbTools.movieDetail(match.tmdbId, match.mediaType);
    const workType = detail.isAnimation
      ? detail.mediaType === "tv" ? "anime_series" : "anime_movie"
      : detail.mediaType === "tv" ? "drama" : "movie";
    return {
      ...value, workTitle: detail.title || value.workTitle, originalTitle: detail.originalTitle || value.originalTitle,
      workType, mediaType: detail.mediaType, tmdbId: detail.tmdbId, year: Number(detail.year) || value.year,
      poster: detail.poster || "",
    };
  } catch {
    return value;
  }
}

async function runVerification() {
  const pending = songs.filter((song) => {
    const result = audit.results[song.slug];
    if (EXHAUSTIVE) return result?.status === "pending" || result?.status === "retryable";
    return result?.status === "screened_candidate" || result?.status === "retryable";
  }).slice(0, LIMIT);
  console.log(`individual verification ${pending.length} songs`);
  for (let index = 0; index < pending.length; index++) {
    const song = pending[index];
    let researched = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !researched; attempt++) {
      researched = await researchOne(song);
      if (!researched && attempt < MAX_ATTEMPTS) await sleep(DELAY_MS);
    }
    if (!researched) {
      audit.results[song.slug] = {
        ...audit.results[song.slug], status: "retryable", phase: "verify", attempts: MAX_ATTEMPTS,
        researchIdentity: { title: song.title, artist: song.artist },
        reason: lastGeminiError || "individual grounded verification returned no usable result", updatedAt: now(),
      };
      console.log(`  retryable ${song.artist} — ${song.title}`);
    } else if (!researched.found) {
      audit.results[song.slug] = {
        status: existingBySong.has(song.slug) ? "existing_verified" : "no_match", phase: "complete",
        researchIdentity: { title: song.title, artist: song.artist },
        queries: researched.queries, sources: researched.sources,
        passes: EXHAUSTIVE ? [
          ...(audit.results[song.slug]?.passes || []).filter((pass) => pass.provider !== "gemini-google-search"),
          { provider: "gemini-google-search", status: "no_match", queries: researched.queries.map(String), sources: researched.sources.map(sourceShape), researchedAt: now() },
        ] : undefined,
        existingIds: (existingBySong.get(song.slug) || []).map((item) => item.id), updatedAt: now(),
      };
      console.log(`  no match ${song.artist} — ${song.title}`);
    } else {
      const enriched = [];
      for (const item of researched.appearances) enriched.push(await enrichTmdb(item));
      audit.results[song.slug] = {
        status: "verified", phase: "complete", queries: researched.queries, sources: researched.sources,
        researchIdentity: { title: song.title, artist: song.artist },
        passes: EXHAUSTIVE ? [
          ...(audit.results[song.slug]?.passes || []).filter((pass) => pass.provider !== "gemini-google-search"),
          { provider: "gemini-google-search", status: "verified", queries: researched.queries.map(String), sources: researched.sources.map(sourceShape), researchedAt: now() },
        ] : undefined,
        appearances: enriched, updatedAt: now(),
      };
      console.log(`  verified ${song.artist} — ${song.title}: ${enriched.map((item) => item.workTitle).join(", ")}`);
    }
    saveAudit();
    if (index + 1 < pending.length) await sleep(DELAY_MS);
  }
}

function mergeDataset() {
  const merged = [...dataset.items];
  const identities = new Set(merged.map(appearanceIdentity));
  const timestamp = now();
  let added = 0;
  for (const [slug, result] of Object.entries(audit.results)) {
    if (result.status !== "verified") continue;
    for (const value of result.appearances || []) {
      const seed = normalizeAppearance({ ...value, songSlug: slug });
      const identity = appearanceIdentity(seed);
      if (identities.has(identity)) continue;
      const item = normalizeAppearance({
        ...seed, id: `backfill-${digest(identity).slice(0, 24)}`,
        createdAt: timestamp, updatedAt: timestamp,
      });
      merged.push(item);
      identities.add(identity);
      added++;
    }
  }
  writeJsonAtomic(datasetFile, { version: 1, updatedAt: timestamp, items: merged });
  audit.mergedAt = timestamp;
  audit.mergedItems = merged.length;
  saveAudit();
  console.log(`merged ${added} new appearances · total ${merged.length}`);
}

async function importCuratedFindings() {
  const curated = JSON.parse(fs.readFileSync(curatedFile, "utf8"));
  const reviewed = new Set((curated.reviewedNoMatch || []).map(String));
  let verified = 0;
  let rejected = 0;
  for (const finding of curated.findings || []) {
    const song = songBySlug.get(String(finding.songSlug || ""));
    if (!song) throw new Error(`curated finding references unknown song: ${finding.songSlug}`);
    const values = Array.isArray(finding.appearances) ? finding.appearances : [];
    if (!values.length) throw new Error(`curated finding has no appearances: ${finding.songSlug}`);
    const appearances = [];
    const sources = [];
    for (const value of values) {
      if (!value.workTitle || !Object.hasOwn(WORK_TYPES, value.workType) || !Object.hasOwn(APPEARANCE_ROLES, value.role)) {
        throw new Error(`invalid curated appearance: ${finding.songSlug}`);
      }
      if (!/^https?:\/\//i.test(String(value.evidenceUrl || ""))) throw new Error(`curated evidence URL missing: ${finding.songSlug}`);
      const source = { uri: String(value.evidenceUrl), title: clean(value.evidenceLabel || "수동 검증 웹 근거", 100) };
      sources.push(source);
      appearances.push(await enrichTmdb({
        workTitle: clean(value.workTitle, 200), originalTitle: clean(value.originalTitle, 200),
        workType: value.workType, mediaType: value.workType === "drama" || value.workType === "anime_series" ? "tv" : "movie",
        tmdbId: null, localMovieSlug: "", year: optionalInteger(value.year), poster: "", role: value.role,
        season: optionalInteger(value.season), episode: optionalInteger(value.episode), evidenceUrl: source.uri,
        evidenceLabel: source.title, status: "verified", note: clean(value.note, 500),
      }));
    }
    audit.results[song.slug] = {
      status: "verified", phase: "complete", queries: ["manual authoritative-source review"],
      sources: [...new Map(sources.map((source) => [source.uri, source])).values()], appearances, updatedAt: now(),
    };
    verified++;
  }
  for (const slug of reviewed) {
    if (!songBySlug.has(slug)) throw new Error(`reviewedNoMatch references unknown song: ${slug}`);
    if (audit.results[slug]?.status === "verified") throw new Error(`song is both verified and reviewedNoMatch: ${slug}`);
    audit.results[slug] = existingBySong.has(slug)
      ? { status: "existing_verified", phase: "complete", existingIds: existingBySong.get(slug).map((item) => item.id), reason: "manual review found no additional appearance", updatedAt: now() }
      : { status: "no_match", phase: "complete", reason: "manual review rejected the screening false positive", updatedAt: now() };
    rejected++;
  }
  saveAudit();
  console.log(`imported curated findings · verified songs ${verified} · reviewed no-match ${rejected}`);
}

function rescoreAudit() {
  let candidates = 0;
  for (const song of songs) {
    const current = audit.results[song.slug];
    const batch = audit.screeningBatches.find((item) => item.id === current?.batchId);
    if (!batch) continue;
    const matching = (batch.sources || []).filter((source) => isCandidateSource(source, song));
    batch.candidateSources = matching.map((source) => source.uri);
    const candidate = matching.length > 0 || forcedCandidate(song);
    audit.results[song.slug] = candidate
      ? { status: "screened_candidate", phase: "verify", batchId: batch.id, reason: forcedCandidate(song) ? "existing metadata contains a screen-use clue" : "screen-use search result matched artist and song title", updatedAt: now() }
      : existingBySong.has(song.slug)
        ? { status: "existing_verified", phase: "complete", batchId: batch.id, existingIds: existingBySong.get(song.slug).map((item) => item.id), updatedAt: now() }
        : { status: "no_match", phase: "complete", batchId: batch.id, updatedAt: now() };
    if (candidate) candidates++;
  }
  saveAudit();
  console.log(`rescored ${songs.length} songs · candidates ${candidates}`);
}

if (RESCORE) rescoreAudit();
if (EXHAUSTIVE_SCREEN) await runExhaustiveScreening();
if (SCREEN) await runScreening();
if (VERIFY && !EXHAUSTIVE_SCREEN) await runVerification();
if (IMPORT_CURATED) await importCuratedFindings();
if (MERGE) mergeDataset();

const counts = Object.values(audit.results).reduce((map, item) => ({ ...map, [item.status]: (map[item.status] || 0) + 1 }), {});
console.log(JSON.stringify({ songs: songs.length, researched: Object.keys(audit.results).length, statuses: counts }, null, 2));
