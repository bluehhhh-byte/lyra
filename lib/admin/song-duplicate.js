const normalized = (value) => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase()
  .replace(/[\p{P}\p{S}\s]+/gu, "")
  .trim();

const DOCUMENT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const rawValue = (frontmatter, key) =>
  (frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1] || "").trim();
const listValue = (value) => String(value || "").replace(/^\[|\]$/g, "").split(",").map((item) => item.trim()).filter(Boolean);
const blank = (value) => !value || value === "[]";
const setRawValue = (raw, key, value) => {
  const line = `${key}: ${value}`;
  const existing = new RegExp(`^${key}:[ \\t]*.*$`, "m");
  if (existing.test(raw)) return raw.replace(existing, line);
  return raw.replace(/\r?\n---\r?\n/, `\n${line}\n---\n`);
};

export function mergeDuplicateSongDocuments(canonicalRaw, duplicateRaw, {
  canonicalSlug,
  duplicateSlug,
  at = new Date(),
} = {}) {
  const canonical = String(canonicalRaw || "").match(DOCUMENT);
  const duplicate = String(duplicateRaw || "").match(DOCUMENT);
  if (!canonical || !duplicate || !canonicalSlug || !duplicateSlug || canonicalSlug === duplicateSlug)
    throw new Error("병합할 곡 문서가 올바르지 않습니다");

  let merged = String(canonicalRaw).replace(/\r\n?/g, "\n");
  const copied = [];
  const scalarFields = [
    "title_ko", "artist_ko", "album", "year", "genre", "artwork", "preview", "trackId",
    "external_url", "duration", "lang", "emotion", "comment", "comment_basis", "lyrics_note",
  ];
  for (const key of scalarFields) {
    if (blank(rawValue(canonical[1], key)) && !blank(rawValue(duplicate[1], key))) {
      merged = setRawValue(merged, key, rawValue(duplicate[1], key));
      copied.push(key);
    }
  }
  for (const key of ["tags", "keywords", "comment_sources", "search_aliases"]) {
    const values = [...new Set([...listValue(rawValue(canonical[1], key)), ...listValue(rawValue(duplicate[1], key))])];
    if (key === "search_aliases") {
      values.push(...[
        rawValue(duplicate[1], "title"), rawValue(duplicate[1], "title_ko"),
        rawValue(duplicate[1], "artist"), rawValue(duplicate[1], "artist_ko"), duplicateSlug,
      ].filter(Boolean));
    }
    const unique = [...new Set(values)];
    if (unique.length) merged = setRawValue(merged, key, `[${unique.join(", ")}]`);
  }
  if (!canonical[2].trim() && duplicate[2].trim()) {
    merged = merged.replace(DOCUMENT, (_all, fm) => `---\n${fm}\n---\n${duplicate[2].trim()}\n`);
    copied.push("lyrics");
  }

  let alias = String(duplicateRaw).replace(/\r\n?/g, "\n");
  alias = setRawValue(alias, "duplicate_of", canonicalSlug);
  alias = setRawValue(alias, "duplicate_merged_at", (at instanceof Date ? at : new Date(at)).toISOString());
  return { canonicalRaw: merged, duplicateRaw: alias, copied };
}

export function findDuplicateSong(candidate, songs, { excludeSlug = "" } = {}) {
  const trackId = String(candidate?.trackId || "").trim();
  const title = normalized(candidate?.title);
  const artist = normalized(candidate?.artist);
  if (!title || !artist) return null;

  const pool = (songs || []).filter((song) => song?.slug !== excludeSlug);
  const byTrack = trackId && pool.find((song) => String(song.trackId || "").trim() === trackId);
  const match = byTrack || pool.find((song) =>
    normalized(song.title) === title && normalized(song.artist) === artist
  );
  if (!match) return null;
  return {
    slug: String(match.slug || ""),
    title: String(match.title || ""),
    artist: String(match.artist || ""),
    reason: byTrack ? "trackId" : "artist-title",
  };
}

export function findDuplicateSongGroups(songs) {
  const buckets = [];
  const byTrack = new Map();
  const byIdentity = new Map();
  for (const song of songs || []) {
    const trackId = String(song?.trackId || "").trim();
    const identity = `${normalized(song?.artist)}|${normalized(song?.title)}`;
    if (trackId) (byTrack.get(trackId) || byTrack.set(trackId, []).get(trackId)).push(song);
    if (identity !== "|") (byIdentity.get(identity) || byIdentity.set(identity, []).get(identity)).push(song);
  }
  for (const [reason, groups] of [["trackId", byTrack], ["artist-title", byIdentity]]) {
    for (const members of groups.values()) if (members.length > 1) buckets.push({ reason, members });
  }
  const seen = new Set();
  return buckets
    .map(({ reason, members }) => {
      const signature = members.map((song) => String(song.slug || "")).sort().join("|");
      if (seen.has(signature)) return null;
      seen.add(signature);
      return {
        reason,
        songs: members.map((song) => ({
          slug: String(song.slug || ""), title: String(song.title || ""), artist: String(song.artist || ""),
          date: String(song.date || ""), trackId: String(song.trackId || ""),
        })).sort((a, b) => a.slug.localeCompare(b.slug)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.songs[0].artist.localeCompare(b.songs[0].artist));
}

// 제목의 괄호·대괄호 부제와 " - Remastered" 같은 꼬리를 걷어 낸 기준 제목.
const baseTitle = (value) => normalized(
  String(value || "").replace(/\s*[(\[（【][^)\]）】]*[)\]）】]\s*/g, " ").replace(/\s+[-–—]\s+.*$/, "")
);

// findDuplicateSong이 놓치는 "표기만 다른 같은 원곡" 후보. 같은 아티스트이면서
// 부제를 걷어 낸 제목이 같거나, 한 제목이 다른 제목을 통째로 품는 곡만 고른다.
// 판정은 하지 않는다 — Jev(lib/admin/jev.js의 checkSameSong)에 물을 후보를 좁힐 뿐이다.
export function nearDuplicateCandidates(candidate, songs, { limit = 3 } = {}) {
  const artist = normalized(candidate?.artist);
  const title = normalized(candidate?.title);
  const base = baseTitle(candidate?.title);
  if (!artist || !title) return [];
  return (songs || [])
    .filter((song) => {
      if (normalized(song?.artist) !== artist) return false;
      const other = normalized(song?.title);
      if (!other || other === title) return false;
      const otherBase = baseTitle(song?.title);
      if (base && otherBase && base === otherBase) return true;
      const [short, long] = other.length < title.length ? [other, title] : [title, other];
      return short.length >= 4 && long.includes(short);
    })
    .slice(0, limit);
}