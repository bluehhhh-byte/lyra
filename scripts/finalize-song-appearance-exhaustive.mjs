import crypto from "node:crypto";
import fs from "node:fs";
import { getAllSongs } from "../lib/songs.js";

const root = process.cwd();
const readJson = (name) => JSON.parse(fs.readFileSync(`${root}/data/${name}`, "utf8"));
const screen = readJson("song-appearance-web-screen.json");
const verification = readJson("song-appearance-web-verify.json");
const curated = readJson("song-appearance-curated.json");
const dataset = readJson("song-appearances.json");
const previous = readJson("song-appearance-exhaustive.json");
const songs = getAllSongs().map((song) => ({
  slug: String(song.slug),
  title: String(song.title || ""),
  artist: String(song.artist || ""),
  album: String(song.album || ""),
  year: Number(song.year) || null,
})).sort((a, b) => a.slug.localeCompare(b.slug));

const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const corpusDigest = digest(songs.map(({ slug, title, artist, album, year }) => ({ slug, title, artist, album, year })));
const screenBySlug = new Map(screen.results.map((result) => [String(result.slug), result]));
const verifyBySlug = new Map(verification.results.map((result) => [String(result.slug), result]));
const curatedBySlug = new Map(curated.findings.map((result) => [String(result.songSlug), result]));
const appearancesBySlug = new Map();
for (const item of dataset.items) {
  const values = appearancesBySlug.get(item.songSlug) || [];
  values.push(item);
  appearancesBySlug.set(item.songSlug, values);
}
const baselineIds = new Set((previous.baseline || []).map((item) => item.id));
const source = (value) => ({
  uri: String(value?.uri || value?.evidenceUrl || ""),
  title: String(value?.title || value?.evidenceLabel || "웹 근거"),
  ...(value?.snippet ? { snippet: String(value.snippet) } : {}),
});
const uniqueSources = (values) => [...new Map(values.filter((item) => item.uri).map((item) => [item.uri.replace(/\/$/, ""), item])).values()];

const results = {};
for (const song of songs) {
  const screened = screenBySlug.get(song.slug);
  if (!screened) throw new Error(`${song.slug}: 전수 1차 검색 결과가 없습니다.`);
  const checked = verifyBySlug.get(song.slug);
  const finding = curatedBySlug.get(song.slug);
  const appearances = appearancesBySlug.get(song.slug) || [];
  const curatedSources = (finding?.appearances || []).map(source);
  const allSources = uniqueSources([
    ...(screened.sources || []).map(source),
    ...(checked?.sources || []).map(source),
    ...curatedSources,
    ...appearances.map(source),
  ]);
  const hasNew = appearances.some((item) => !baselineIds.has(item.id));
  const status = appearances.length ? (hasNew ? "verified" : "existing_verified") : "no_match";
  const passes = [{
    provider: "codex-web-search-screen",
    status: screened.candidate ? "candidate" : "no_match",
    queries: [String(screened.query)],
    sources: (screened.sources || []).map(source),
    researchedAt: screen.generatedAt,
  }];
  if (screened.candidate || appearances.length) {
    if (checked) passes.push({
      provider: "codex-web-search-verify",
      status: (checked.sources || []).length ? "reviewed" : "no_match",
      queries: [String(checked.query)],
      sources: (checked.sources || []).map(source),
      researchedAt: verification.generatedAt,
    });
    passes.push({
      provider: "curated-authoritative-review",
      status,
      queries: [`exact recording review: ${song.artist} — ${song.title}`],
      sources: uniqueSources([...curatedSources, ...appearances.map(source)]),
      researchedAt: curated.reviewedAt || new Date().toISOString(),
    });
  }
  results[song.slug] = {
    status,
    phase: "complete",
    screeningCandidate: Boolean(screened.candidate),
    reviewOutcome: appearances.length ? "verified_appearance" : screened.candidate ? "reviewed_no_match" : "screened_no_match",
    researchIdentity: { title: song.title, artist: song.artist },
    queries: passes.flatMap((pass) => pass.queries),
    sources: allSources,
    passes,
    ...(appearances.length ? { appearances } : {}),
    ...(status === "existing_verified" ? { existingIds: appearances.map((item) => item.id) } : {}),
    updatedAt: new Date().toISOString(),
  };
}

const output = {
  version: 2,
  createdAt: previous.createdAt || screen.generatedAt,
  updatedAt: new Date().toISOString(),
  corpusDigest,
  totalSongs: songs.length,
  baseline: previous.baseline || [],
  allowedBaselineRepairs: [{
    id: "backfill-d5b6bfe0fd93cb0fd21ca676",
    reason: "404가 된 Apple Music 근거를 동일 곡·동일 OST를 명시하는 벅스 곡 페이지로 교체",
  }],
  researchMethod: "955곡 전체 Codex 웹 검색 → 후보별 단독 재검색 → 공식·레이블·방송사·IMDb 원문 수동 검증",
  artifacts: {
    screening: "data/song-appearance-web-screen.json",
    candidateVerification: "data/song-appearance-web-verify.json",
    curatedDecisions: "data/song-appearance-curated.json",
  },
  results,
};
fs.writeFileSync(`${root}/data/song-appearance-exhaustive.json`, `${JSON.stringify(output, null, 2)}\n`, "utf8");
const counts = Object.values(results).reduce((map, item) => ({ ...map, [item.status]: (map[item.status] || 0) + 1 }), {});
console.log(JSON.stringify({ songs: songs.length, candidates: screen.results.filter((item) => item.candidate).length, datasetItems: dataset.items.length, statuses: counts }, null, 2));
