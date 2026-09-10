import {
  DEFAULT_APPEARANCE_AI_DAILY_LIMIT,
  RESEARCH_TIME_ZONE,
  researchDailyLimit,
  researchDateKey,
} from "./research-budget.js";
import { AI_PHASES, aiBudgetLimits, aiBudgetStatus, isAiPhase } from "./ai-budget.js";

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
        create table if not exists lyra_ai_research_provider_state (
          provider text primary key,
          blocked_at timestamptz,
          blocked_until timestamptz,
          blocked_reason text not null default '',
          updated_at timestamptz not null default now()
        )
      `;
      // 기능별 일일 소계. lyra_ai_research_daily는 곡 연구 전용으로 남겨 두고
      // (그쪽에 provider block 같은 고유 상태가 붙어 있다) 나머지 AI 기능은
      // 여기에 담는다. day+phase가 키라 한 기능의 소진이 다른 기능을 막지 않는다.
      await sql`
        create table if not exists lyra_ai_phase_daily (
          day date not null,
          phase text not null,
          used integer not null default 0 check (used >= 0),
          last_call_at timestamptz,
          last_ref text not null default '',
          updated_at timestamptz not null default now(),
          primary key (day, phase)
        )
      `;
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

const budgetShape = (row, { limit, at, provider }) => {
  const dailyLimit = researchDailyLimit(limit);
  const used = Math.max(0, Number(row?.used) || 0);
  const now = at instanceof Date ? at : new Date(at);
  const providerUntil = provider?.blocked_until ? new Date(provider.blocked_until) : null;
  const persistentBlock = Boolean(providerUntil && providerUntil > now);
  const providerBlocked = Boolean(row?.blocked_at) || persistentBlock;
  return {
    day: researchDateKey(at),
    timezone: RESEARCH_TIME_ZONE,
    limit: dailyLimit,
    used,
    remaining: providerBlocked ? 0 : Math.max(0, dailyLimit - used),
    exhausted: providerBlocked || used >= dailyLimit,
    providerBlocked,
    blockedAt: providerBlocked ? new Date(provider?.blocked_at || row?.blocked_at).toISOString() : "",
    blockedUntil: persistentBlock ? providerUntil.toISOString() : "",
    blockedReason: String(providerBlocked ? (provider?.blocked_reason || row?.blocked_reason || "") : ""),
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
  const [rows, providerRows] = await Promise.all([sql`
    select used, last_call_at, last_phase, last_song_slug, blocked_at, blocked_reason
    from lyra_ai_research_daily
    where day = ${day}::date
    limit 1
  `, sql`
    select blocked_at, blocked_until, blocked_reason
    from lyra_ai_research_provider_state
    where provider = 'gemini'
    limit 1
  `]);
  return budgetShape(rows[0], { limit, at, provider: providerRows[0] });
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
  const before = await readResearchBudget(sql, { limit: dailyLimit, at });
  if (before.providerBlocked) return { allowed: false, status: before };
  if (dailyLimit <= 0) {
    return { allowed: false, status: before };
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
  retryAfterMs = 0,
} = {}) {
  await ensureResearchBudgetSchema(sql);
  const day = researchDateKey(at);
  const timestamp = (at instanceof Date ? at : new Date(at)).toISOString();
  // Gemini's RetryInfo is authoritative when present. Quota responses often omit
  // it, so keep a 24-hour provider cooldown that survives the KST day boundary.
  const cooldown = Math.max(Number(retryAfterMs) || 0, 24 * 60 * 60 * 1000);
  const blockedUntil = new Date(new Date(timestamp).getTime() + cooldown).toISOString();
  await sql`
    insert into lyra_ai_research_daily (day, used, blocked_at, blocked_reason, updated_at)
    values (${day}::date, 0, ${timestamp}::timestamptz, ${String(reason || "AI 공급자 할당량 제한")}, now())
    on conflict (day) do update set
      blocked_at = excluded.blocked_at,
      blocked_reason = excluded.blocked_reason,
      updated_at = now()
  `;
  await sql`
    insert into lyra_ai_research_provider_state
      (provider, blocked_at, blocked_until, blocked_reason, updated_at)
    values ('gemini', ${timestamp}::timestamptz, ${blockedUntil}::timestamptz, ${String(reason || "AI 공급자 할당량 제한")}, now())
    on conflict (provider) do update set
      blocked_at = excluded.blocked_at,
      blocked_until = greatest(lyra_ai_research_provider_state.blocked_until, excluded.blocked_until),
      blocked_reason = excluded.blocked_reason,
      updated_at = now()
  `;
  return readResearchBudget(sql, { limit, at });
}

export async function clearResearchProviderBlock(sql) {
  await ensureResearchBudgetSchema(sql);
  await sql`
    update lyra_ai_research_provider_state
    set blocked_at = null, blocked_until = null, blocked_reason = '', updated_at = now()
    where provider = 'gemini'
  `;
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

// ── 기능별 AI 예산 ────────────────────────────────────────────────────────
// 곡 연구의 예약 문법(충돌 갱신의 WHERE에 한도를 걸어 카운터를 올린 호출자만
// 행을 돌려받는다)을 그대로 쓴다. 다른 점은 계정 합산 상한이 하나 더 있다는 것.

async function readPhaseUsage(sql, day) {
  const rows = await sql`
    select phase, used from lyra_ai_phase_daily where day = ${day}::date
  `;
  const used = {};
  for (const row of rows) used[String(row.phase)] = Math.max(0, Number(row.used) || 0);
  return used;
}

export async function readAiBudget(sql, { at = new Date(), env = process.env } = {}) {
  await ensureResearchBudgetSchema(sql);
  const day = researchDateKey(at);
  const limits = aiBudgetLimits(env);
  // 곡 연구는 제 테이블에서 센다 — 두 곳에 나뉜 이유는 위 스키마 주석에 있다.
  const [phaseUsed, researchRows] = await Promise.all([
    readPhaseUsage(sql, day),
    sql`select used from lyra_ai_research_daily where day = ${day}::date limit 1`,
  ]);
  phaseUsed.research = Math.max(0, Number(researchRows[0]?.used) || 0);
  return { day, timezone: RESEARCH_TIME_ZONE, ...aiBudgetStatus(phaseUsed, limits) };
}

// 예약은 두 단계다. 기능 몫은 충돌 갱신의 WHERE가 원자적으로 지키고, 계정 상한은
// 직전 읽기로 본다.
// ponytail: 계정 상한 검사는 원자적이지 않다 — 같은 순간에 두 요청이 들어오면
// 합산이 1~2회 넘을 수 있다. 사용자가 한 명이고 관리자 화면에서만 호출되므로
// 실익보다 복잡도가 크다. 동시성이 실제로 문제가 되면 day 단위 advisory lock으로
// 올린다.
export async function reserveAiCall(sql, { phase, at = new Date(), ref = "", env = process.env } = {}) {
  if (!isAiPhase(phase)) throw new Error(`알 수 없는 AI 기능: ${phase}`);
  await ensureResearchBudgetSchema(sql);
  const before = await readAiBudget(sql, { at, env });
  if (before.account.exhausted) return { allowed: false, status: before, reason: "account" };
  const row = before.phases[phase];
  if (!row || row.limit <= 0 || row.used >= row.limit) return { allowed: false, status: before, reason: "phase" };

  const day = researchDateKey(at);
  const timestamp = (at instanceof Date ? at : new Date(at)).toISOString();
  const rows = await sql`
    insert into lyra_ai_phase_daily (day, phase, used, last_call_at, last_ref, updated_at)
    values (${day}::date, ${String(phase)}, 1, ${timestamp}::timestamptz, ${String(ref || "")}, now())
    on conflict (day, phase) do update set
      used = lyra_ai_phase_daily.used + 1,
      last_call_at = excluded.last_call_at,
      last_ref = excluded.last_ref,
      updated_at = now()
    where lyra_ai_phase_daily.used < ${row.limit}
    returning used
  `;
  const status = await readAiBudget(sql, { at, env });
  return rows.length ? { allowed: true, status } : { allowed: false, status, reason: "phase" };
}

// 어제 하루 몇 번 썼나 — 경보 워크플로(Track A)가 읽는다.
export async function readAiUsageFor(sql, day) {
  await ensureResearchBudgetSchema(sql);
  const [phaseUsed, researchRows] = await Promise.all([
    readPhaseUsage(sql, day),
    sql`select used from lyra_ai_research_daily where day = ${day}::date limit 1`,
  ]);
  phaseUsed.research = Math.max(0, Number(researchRows[0]?.used) || 0);
  const total = AI_PHASES.reduce((sum, phase) => sum + (phaseUsed[phase] || 0), 0);
  return { day, phases: phaseUsed, total };
}
