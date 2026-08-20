// 배포 작업 장부 — 같은 커밋을 두 번 배포하지 않고, 동시에 하나만 빌드하게 한다.
//
// 예전에는 중복 방지가 브라우저 useRef 하나뿐이었다. 탭 하나 안에서만 유효하다 —
// 두 기기, 두 탭, 또는 응답이 느릴 때의 연타가 각각 Vercel 배포를 만들었고,
// forceNew=1이라 같은 커밋도 매번 새로 빌드했다. 무료 티어에서 빌드 분과 대역폭을
// 이유 없이 태우는 구멍이다.
//
// 진실은 서버에, 서버리스에서는 곧 Neon에 있다. 인스턴스는 요청마다 다를 수 있으므로
// 인메모리 잠금은 교차 기기 보장이 못 된다. 행 하나가 잠금이다:
//   - commit_sha가 PK — 같은 커밋의 동시 claim은 원자적 upsert 하나로 수렴한다
//   - status='BUILDING' 부분 유니크 인덱스 — 서로 다른 커밋이라도 동시에 하나만 빌드
//   - lease_expires_at — 함수가 죽어도 10분 뒤 잠금이 풀린다 (서버리스는 요청이 끝나면
//     아무것도 정리해 주지 않는다)
//
// Neon이 꺼진 개발 환경은 인메모리로 같은 의미를 흉내 낸다. 교차 인스턴스 보장은
// 어차피 운영(=Neon 켜짐)에서만 필요하다.
import { neon } from "@neondatabase/serverless";
import { databaseContentEnabled } from "./content-db.js";

// lease가 곧 cooldown이다 — 빌드 하나가 이 시간 안에 끝나거나, 죽었다고 보고 복구한다.
export const LEASE_MINUTES = 10;

const READY = "READY";
const BUILDING = "BUILDING";
const ERROR = "ERROR";

// ── Neon 저장소 ──────────────────────────────────────────────────────────────
let sqlClient = null;
let migrated = false;

function getSql(env = process.env) {
  if (!sqlClient) sqlClient = neon(String(env.DATABASE_URL || "").replace(/^﻿/, "").trim());
  return sqlClient;
}

// 재실행해도 안전한 migration. 별도 스크립트 대신 첫 사용 때 만든다 —
// 배포 장부가 없다고 배포가 죽는 것보다, 조용히 만들어지는 편이 낫다.
async function migrate(sql) {
  if (migrated) return;
  await sql`
    create table if not exists lyra_deploy_jobs (
      commit_sha text primary key,
      status text not null,
      deployment_id text not null default '',
      error text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      lease_expires_at timestamptz
    )
  `;
  // BUILDING 행은 언제나 최대 하나 — 서로 다른 커밋의 동시 배포도 여기서 막힌다.
  await sql`
    create unique index if not exists lyra_deploy_jobs_single_building
    on lyra_deploy_jobs ((status)) where status = 'BUILDING'
  `;
  migrated = true;
}

const rowView = (r) =>
  r && {
    commitSha: r.commit_sha,
    status: r.status,
    deploymentId: r.deployment_id || "",
    error: r.error || "",
    updatedAt: r.updated_at,
  };

// 만료 판정은 "lease_expires_at < now" 한 가지다 — 정확히 같은 시각이면 아직
// 살아 있다. 경계를 두 군데서 다르게 읽으면 재진입 화면과 claim이 서로 다른
// 답을 낸다. (인메모리 경로도 같은 부등호를 쓴다 — 테스트로 고정)
async function neonSweep(sql) {
  await sql`
    update lyra_deploy_jobs
    set status = 'ERROR', error = '이전 배포가 응답 없이 시한을 넘겨 복구됨', updated_at = now()
    where status = 'BUILDING' and lease_expires_at < now()
  `;
}

async function neonClaim(sha) {
  const sql = getSql();
  await migrate(sql);
  // 죽은 작업 복구 — lease가 지난 BUILDING은 실패로 접어 잠금을 푼다.
  await neonSweep(sql);
  const [existing] = await sql`select * from lyra_deploy_jobs where commit_sha = ${sha}`;
  if (existing?.status === READY) return { kind: "already-deployed", job: rowView(existing) };
  if (existing?.status === BUILDING) return { kind: "in-progress", job: rowView(existing) };
  try {
    const rows = await sql`
      insert into lyra_deploy_jobs (commit_sha, status, lease_expires_at)
      values (${sha}, 'BUILDING', now() + make_interval(mins => ${LEASE_MINUTES}))
      on conflict (commit_sha) do update
        set status = 'BUILDING', error = '', deployment_id = '',
            lease_expires_at = now() + make_interval(mins => ${LEASE_MINUTES}),
            updated_at = now()
        where lyra_deploy_jobs.status not in ('READY', 'BUILDING')
      returning *
    `;
    // upsert가 행을 안 돌려주면 그 사이 다른 요청이 이미 READY/BUILDING으로 만들었다
    if (!rows.length) {
      const [row] = await sql`select * from lyra_deploy_jobs where commit_sha = ${sha}`;
      return { kind: row?.status === READY ? "already-deployed" : "in-progress", job: rowView(row) };
    }
    return { kind: "claimed", job: rowView(rows[0]) };
  } catch (e) {
    // 부분 유니크 인덱스 위반 = 다른 커밋이 지금 빌드 중
    if (String(e?.code) === "23505" || /unique/i.test(String(e?.message))) {
      const [busy] = await sql`select * from lyra_deploy_jobs where status = 'BUILDING' limit 1`;
      return { kind: "busy", job: rowView(busy) };
    }
    throw e;
  }
}

async function neonUpdate(sha, fields) {
  const sql = getSql();
  await migrate(sql);
  await sql`
    update lyra_deploy_jobs
    set status = coalesce(${fields.status || null}, status),
        deployment_id = coalesce(${fields.deploymentId ?? null}, deployment_id),
        error = coalesce(${fields.error ?? null}, error),
        lease_expires_at = case when ${fields.clearLease ? 1 : 0} = 1 then null else lease_expires_at end,
        updated_at = now()
    where commit_sha = ${sha}
  `;
}

// heartbeat — 빌드가 살아 있는 동안 lease를 밀어 준다. 그 배포(sha+deploymentId)의
// BUILDING 행만 민다. 남의 행이나 이미 끝난 행을 밀면 죽은 작업이 복구되지 않는다.
async function neonRenew(sha, deploymentId) {
  const sql = getSql();
  await migrate(sql);
  await sql`
    update lyra_deploy_jobs
    set lease_expires_at = now() + make_interval(mins => ${LEASE_MINUTES}), updated_at = now()
    where commit_sha = ${sha} and deployment_id = ${deploymentId} and status = 'BUILDING'
  `;
}

async function neonCurrent() {
  const sql = getSql();
  await migrate(sql);
  // 재진입 화면도 정확해야 한다 — claim 없이 조회만 해도 만료 BUILDING은 정리된다.
  await neonSweep(sql);
  const [building] = await sql`select * from lyra_deploy_jobs where status = 'BUILDING' limit 1`;
  if (building) return rowView(building);
  const [latest] = await sql`select * from lyra_deploy_jobs order by updated_at desc limit 1`;
  return rowView(latest);
}

// ── 인메모리 폴백 (Neon 꺼진 개발 환경) ─────────────────────────────────────
const mem = new Map(); // sha → row

// 만료 판정 부등호는 Neon 경로와 같다: leaseExpiresAt < now. 같은 시각이면 산다.
function memSweep(now) {
  for (const row of mem.values())
    if (row.status === BUILDING && row.leaseExpiresAt < now) {
      row.status = ERROR;
      row.error = "이전 배포가 응답 없이 시한을 넘겨 복구됨";
      row.leaseExpiresAt = null;
      row.updatedAt = now;
    }
}

function memClaim(sha, now = Date.now()) {
  memSweep(now);
  const existing = mem.get(sha);
  if (existing?.status === READY) return { kind: "already-deployed", job: memView(existing) };
  if (existing?.status === BUILDING) return { kind: "in-progress", job: memView(existing) };
  for (const row of mem.values())
    if (row.status === BUILDING) return { kind: "busy", job: memView(row) };
  const row = {
    commitSha: sha, status: BUILDING, deploymentId: "", error: "",
    leaseExpiresAt: now + LEASE_MINUTES * 60_000, updatedAt: now,
  };
  mem.set(sha, row);
  return { kind: "claimed", job: memView(row) };
}

const memView = (r) => ({ commitSha: r.commitSha, status: r.status, deploymentId: r.deploymentId, error: r.error, updatedAt: r.updatedAt });

function memUpdate(sha, fields) {
  const row = mem.get(sha);
  if (!row) return;
  if (fields.status) row.status = fields.status;
  if (fields.deploymentId != null) row.deploymentId = fields.deploymentId;
  if (fields.error != null) row.error = fields.error;
  if (fields.clearLease) row.leaseExpiresAt = null;
  row.updatedAt = Date.now();
}

function memRenew(sha, deploymentId, now = Date.now()) {
  const row = mem.get(sha);
  if (!row || row.status !== BUILDING || row.deploymentId !== deploymentId) return;
  row.leaseExpiresAt = now + LEASE_MINUTES * 60_000;
  row.updatedAt = now;
}

function memCurrent(now = Date.now()) {
  memSweep(now);
  let latest = null;
  for (const row of mem.values()) {
    if (row.status === BUILDING) return memView(row);
    if (!latest || row.updatedAt > latest.updatedAt) latest = row;
  }
  return latest && memView(latest);
}

// ── 공개 API ─────────────────────────────────────────────────────────────────
const useDb = () => databaseContentEnabled();

// 이 커밋을 배포해도 되는가. claimed일 때만 Vercel 배포를 만들어야 한다.
export const claimDeploy = (sha) => (useDb() ? neonClaim(sha) : Promise.resolve(memClaim(sha)));

// 배포 생성 직후 — 폴링이 job을 deployment로 찾을 수 있게 잇는다.
export const attachDeployment = (sha, deploymentId) =>
  useDb() ? neonUpdate(sha, { deploymentId }) : Promise.resolve(memUpdate(sha, { deploymentId }));

// heartbeat — Vercel이 아직 빌드 중이라고 답하는 동안 폴링 GET이 이걸 불러 lease를
// 민다. 빌드가 10분을 넘어도 heartbeat가 이어지는 한 다른 배포는 시작되지 않고,
// heartbeat가 끊기면(탭 닫힘 + 함수 죽음) 마지막 갱신 + 10분 뒤에 복구된다.
export const renewDeployLease = (sha, deploymentId) =>
  useDb() ? neonRenew(sha, deploymentId) : Promise.resolve(memRenew(sha, deploymentId));

// 종결. ok=true는 운영 검증까지 통과했다는 뜻이다 — Vercel READY만으로 부르지 마라.
// lease는 지운다 — 끝난 행의 시한이 남아 있으면 읽는 쪽이 의미를 또 해석해야 한다.
export const finishDeploy = (sha, { ok, error = "" }) =>
  useDb()
    ? neonUpdate(sha, { status: ok ? READY : ERROR, error: ok ? "" : String(error).slice(0, 300), clearLease: true })
    : Promise.resolve(memUpdate(sha, { status: ok ? READY : ERROR, error: ok ? "" : String(error).slice(0, 300), clearLease: true }));

// 화면 재진입용 — 진행 중인 작업이 있으면 그것을, 없으면 마지막 작업을 준다.
export const currentDeployJob = () => (useDb() ? neonCurrent() : Promise.resolve(memCurrent()));

// 테스트 전용 — 인메모리 상태 초기화
export const _resetMemory = () => mem.clear();
