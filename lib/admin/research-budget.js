export const RESEARCH_TIME_ZONE = "Asia/Seoul";
export const DEFAULT_APPEARANCE_AI_DAILY_LIMIT = 25;
const RETAIN_DAYS = 45;

export const researchDateKey = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESEARCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const researchDailyLimit = (value) => Math.floor(Math.max(0, Math.min(500, Number.isFinite(Number(value)) ? Number(value) : DEFAULT_APPEARANCE_AI_DAILY_LIMIT)));

export function normalizeResearchBudget(value = {}) {
  const days = value?.days && typeof value.days === "object" ? value.days : {};
  const normalized = {
    version: 1,
    timezone: RESEARCH_TIME_ZONE,
    days: {},
  };
  for (const [day, entry] of Object.entries(days).sort().slice(-RETAIN_DAYS)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    normalized.days[day] = {
      used: Math.max(0, Math.floor(Number(entry?.used) || 0)),
      lastCallAt: String(entry?.lastCallAt || ""),
      lastPhase: String(entry?.lastPhase || ""),
      lastSongSlug: String(entry?.lastSongSlug || ""),
    };
  }
  return normalized;
}

export function researchBudgetStatus(value, { limit = DEFAULT_APPEARANCE_AI_DAILY_LIMIT, at = new Date() } = {}) {
  const budget = normalizeResearchBudget(value);
  const day = researchDateKey(at);
  const dailyLimit = researchDailyLimit(limit);
  const used = budget.days[day]?.used || 0;
  return {
    day,
    timezone: RESEARCH_TIME_ZONE,
    limit: dailyLimit,
    used,
    remaining: Math.max(0, dailyLimit - used),
    exhausted: used >= dailyLimit,
  };
}

// Reserve before making the external call. A timeout, provider error, or process
// crash still consumes the reservation, so retries can never silently exceed the
// configured daily ceiling.
export function reserveResearchCall(value, {
  limit = DEFAULT_APPEARANCE_AI_DAILY_LIMIT,
  at = new Date(),
  phase = "",
  songSlug = "",
} = {}) {
  const budget = normalizeResearchBudget(value);
  const status = researchBudgetStatus(budget, { limit, at });
  if (status.exhausted) return { allowed: false, budget, status };
  budget.days[status.day] = {
    used: status.used + 1,
    lastCallAt: (at instanceof Date ? at : new Date(at)).toISOString(),
    lastPhase: String(phase || ""),
    lastSongSlug: String(songSlug || ""),
  };
  return {
    allowed: true,
    budget,
    status: researchBudgetStatus(budget, { limit, at }),
  };
}

// Keep completed work when the song corpus changes. Removed songs are archived
// instead of merged into the live dataset; newly added songs receive a caller-
// supplied pending state and become the next resumable work items.
export function reconcileResearchCheckpoint(audit, currentSlugs, {
  corpusDigest,
  at = new Date(),
  makePending = () => undefined,
} = {}) {
  const timestamp = (at instanceof Date ? at : new Date(at)).toISOString();
  const slugs = [...new Set((currentSlugs || []).map(String))].sort();
  const current = new Set(slugs);
  audit.results ||= {};
  audit.retiredResults ||= {};
  const corpusChanged = audit.corpusDigest !== corpusDigest || audit.totalSongs !== slugs.length;
  const removed = Object.keys(audit.results).filter((slug) => !current.has(slug)).sort();
  for (const slug of removed) {
    audit.retiredResults[slug] = { ...audit.results[slug], retiredAt: timestamp };
    delete audit.results[slug];
  }
  // An in-progress non-exhaustive audit intentionally has no result entry for
  // songs it has not screened yet. Only call those songs "added" when the
  // corpus snapshot itself changed; otherwise every resume would rewrite the
  // checkpoint while reporting the same pending songs as newly added.
  const added = corpusChanged
    ? slugs.filter((slug) => !Object.hasOwn(audit.results, slug))
    : [];
  for (const slug of added) {
    const pending = makePending(slug);
    if (pending !== undefined) audit.results[slug] = pending;
  }
  const changed = corpusChanged || removed.length > 0;
  if (changed) {
    audit.corpusChanges ||= [];
    audit.corpusChanges.push({ at: timestamp, from: Number(audit.totalSongs) || 0, to: slugs.length, added, removed });
    audit.corpusChanges = audit.corpusChanges.slice(-20);
  }
  audit.corpusDigest = corpusDigest;
  audit.totalSongs = slugs.length;
  return { changed: Boolean(changed), added, removed };
}

// Registration must not wait for the next long-running audit command to notice a
// new song. This deliberately changes only the new row: the exhaustive script
// remains responsible for recalculating the corpus digest and retiring removals.
export function enrollAppearanceCheckpoint(value, song, { at = new Date() } = {}) {
  const audit = value && typeof value === "object" ? structuredClone(value) : {};
  audit.results ||= {};
  const slug = String(song?.slug || "").trim();
  if (!slug || audit.results[slug]) return { audit, added: false };
  const timestamp = (at instanceof Date ? at : new Date(at)).toISOString();
  audit.results[slug] = {
    status: "pending",
    phase: "exhaustive",
    passes: [],
    updatedAt: timestamp,
    researchIdentity: { title: String(song?.title || ""), artist: String(song?.artist || "") },
  };
  audit.totalSongs = Math.max(Number(audit.totalSongs) || 0, Object.keys(audit.results).length);
  audit.updatedAt = timestamp;
  return { audit, added: true };
}
