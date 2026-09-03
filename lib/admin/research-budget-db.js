import {
  DEFAULT_APPEARANCE_AI_DAILY_LIMIT,
  RESEARCH_TIME_ZONE,
  researchDailyLimit,
  researchDateKey,
} from "./research-budget.js";

let schemaPromise;

export async function ensureResearchBudgetSchema(sql) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`
        create table if not exists lyra_ai_research_daily (
          day date primary key,
          used integer not null default 0 check (used >= 0),
          last_call_at timestamptz,
          last_phase text not null default '',
          last_song_slug text not null default '',
          blocked_at timestamptz,
          blocked_reason text not null default '',
          updated_at timestamptz not null default now()
        )
      `;
      await sql`alter table lyra_ai_research_daily add column if not exists blocked_at timestamptz`;
      await sql`alter table lyra_ai_research_daily add column if not exists blocked_reason text not null default ''`;
      await sql`
        create table if not exists lyra_ai_research_state (
          audit text primary key,
          total_songs integer not null default 0,
          researched integer not null default 0,
          pending integer not null default 0,
          retired integer not null default 0,
          statuses jsonb not null default '{}'::jsonb,
          updated_at timestamptz not null default now()
        )
      `;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

const budgetShape = (row, { limit, at }) => {
  const dailyLimit = researchDailyLimit(limit);
  const used = Math.max(0, Number(row?.used) || 0);
  const providerBlocked = Boolean(row?.blocked_at);
  return {
    day: researchDateKey(at),
    timezone: RESEARCH_TIME_ZONE,
    limit: dailyLimit,
    used,
    remaining: providerBlocked ? 0 : Math.max(0, dailyLimit - used),
    exhausted: providerBlocked || used >= dailyLimit,
    providerBlocked,
    blockedAt: row?.blocked_at ? new Date(row.blocked_at).toISOString() : "",
    blockedReason: String(row?.blocked_reason || ""),
    lastCallAt: row?.last_call_at ? new Date(row.last_call_at).toISOString() : "",
    lastPhase: String(row?.last_phase || ""),
    lastSongSlug: String(row?.last_song_slug || ""),
    storage: "neon",
  };
};

export async function readResearchBudget(sql, {
  limit = DEFAULT_APPEARANCE_AI_DAILY_LIMIT,
  at = new Date(),
} = {}) {
  await ensureResearchBudgetSchema(sql);
  const day = researchDateKey(at);
  const rows = await sql`
    select used, last_call_at, last_phase, last_song_slug, blocked_at, blocked_reason
    from lyra_ai_research_daily
    where day = ${day}::date
    limit 1
  `;
  return budgetShape(rows[0], { limit, at });
}

// Postgres evaluates the conflict update and WHERE while holding the row lock.
// Only a caller that actually increments the shared counter receives a row.
export async function reserveResearchBudget(sql, {
  limit = DEFAULT_APPEARANCE_AI_DAILY_LIMIT,
  at = new Date(),
  phase = "",
  songSlug = "",
} = {}) {
  await ensureResearchBudgetSchema(sql);
  const dailyLimit = researchDailyLimit(limit);
  if (dailyLimit <= 0) {
    const status = await readResearchBudget(sql, { limit: dailyLimit, at });
    return { allowed: false, status };
  }
  const day = researchDateKey(at);
  const timestamp = (at instanceof Date ? at : new Date(at)).toISOString();
  const rows = await sql`
    insert into lyra_ai_research_daily
      (day, used, last_call_at, last_phase, last_song_slug, updated_at)
    values (${day}::date, 1, ${timestamp}::timestamptz, ${String(phase || "")}, ${String(songSlug || "")}, now())
    on conflict (day) do update set
      used = lyra_ai_research_daily.used + 1,
      last_call_at = excluded.last_call_at,
      last_phase = excluded.last_phase,
      last_song_slug = excluded.last_song_slug,
      updated_at = now()
    where lyra_ai_research_daily.used < ${dailyLimit}
      and lyra_ai_research_daily.blocked_at is null
    returning used, last_call_at, last_phase, last_song_slug, blocked_at, blocked_reason
  `;
  if (rows.length) return { allowed: true, status: budgetShape(rows[0], { limit: dailyLimit, at }) };
  return { allowed: false, status: await readResearchBudget(sql, { limit: dailyLimit, at }) };
}

export async function markResearchBudgetBlocked(sql, {
  limit = DEFAULT_APPEARANCE_AI_DAILY_LIMIT,
  at = new Date(),
  reason = "AI 공급자 할당량 제한",
} = {}) {
  await ensureResearchBudgetSchema(sql);
  const day = researchDateKey(at);
  const timestamp = (at instanceof Date ? at : new Date(at)).toISOString();
  await sql`
    insert into lyra_ai_research_daily (day, used, blocked_at, blocked_reason, updated_at)
    values (${day}::date, 0, ${timestamp}::timestamptz, ${String(reason || "AI 공급자 할당량 제한")}, now())
    on conflict (day) do update set
      blocked_at = excluded.blocked_at,
      blocked_reason = excluded.blocked_reason,
      updated_at = now()
  `;
  return readResearchBudget(sql, { limit, at });
}

export async function writeResearchCheckpoint(sql, {
  audit = "exhaustive",
  totalSongs = 0,
  researched = 0,
  pending = 0,
  retired = 0,
  statuses = {},
} = {}) {
  await ensureResearchBudgetSchema(sql);
  const statusJson = JSON.stringify(statuses && typeof statuses === "object" ? statuses : {});
  await sql`
    insert into lyra_ai_research_state
      (audit, total_songs, researched, pending, retired, statuses, updated_at)
    values (
      ${String(audit || "exhaustive")}, ${Math.max(0, Number(totalSongs) || 0)},
      ${Math.max(0, Number(researched) || 0)}, ${Math.max(0, Number(pending) || 0)},
      ${Math.max(0, Number(retired) || 0)}, ${statusJson}::jsonb, now()
    )
    on conflict (audit) do update set
      total_songs = excluded.total_songs,
      researched = excluded.researched,
      pending = excluded.pending,
      retired = excluded.retired,
      statuses = excluded.statuses,
      updated_at = now()
  `;
}

export async function readResearchDashboard(sql, {
  audit = "exhaustive",
  limit = DEFAULT_APPEARANCE_AI_DAILY_LIMIT,
  at = new Date(),
} = {}) {
  await ensureResearchBudgetSchema(sql);
  const [budget, rows] = await Promise.all([
    readResearchBudget(sql, { limit, at }),
    sql`
      select audit, total_songs, researched, pending, retired, statuses, updated_at
      from lyra_ai_research_state
      where audit = ${String(audit || "exhaustive")}
      limit 1
    `,
  ]);
  const row = rows[0];
  return {
    enabled: true,
    budget,
    checkpoint: row ? {
      audit: String(row.audit),
      totalSongs: Number(row.total_songs) || 0,
      researched: Number(row.researched) || 0,
      pending: Number(row.pending) || 0,
      retired: Number(row.retired) || 0,
      statuses: row.statuses && typeof row.statuses === "object" ? row.statuses : {},
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
    } : null,
  };
}
