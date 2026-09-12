// 무료티어 지표를 모아 리포트를 찍고, 경보면 exit 2로 알린다.
//
// 판정과 리포트 문안은 lib/quota-watch.js의 순수 함수가 맡는다 — 여기서는
// 값을 모으는 일만 한다. 그래야 규칙을 테스트할 수 있다.
//
//   node scripts/quota-watch.mjs                  # 사람이 보려고
//   node scripts/quota-watch.mjs --json           # 워크플로가 파싱하려고
//
// exit: 0 정상 · 2 경보 · 1 수집 실패
import dotenv from "dotenv";
import { checkHealth } from "./healthcheck.mjs";
import { evaluateQuota, renderQuotaReport, pickNeonProject } from "../lib/quota-watch.js";

dotenv.config({ path: ".env.local", override: false, quiet: true });

const clean = (value) => String(value ?? "").replace(/^﻿/, "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
const BASE = clean(process.env.LYRA_SITE_URL) || "https://lyracyno.vercel.app";
const asJson = process.argv.includes("--json");

const get = async (url, options = {}) => {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), ...options });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

// /api/version — 저장소 모드, 파일 폴백 여부, Data Cache payload
let version = null;
let versionError = "";
try {
  version = await get(new URL("/api/version", BASE).href);
} catch (error) {
  versionError = error.message;
}

let health = { ok: false, message: `버전 조회 실패: ${versionError}` };
if (version) {
  try {
    health = await checkHealth(BASE);
  } catch (error) {
    health = { ok: false, message: `헬스체크 연결 실패: ${error.message}` };
  }
}

// Neon 콘솔 API — usage-metrics.js와 같은 엔드포인트를 쓴다. 그쪽은 서버 런타임
// 전용(getContentDb 의존)이라 여기서 직접 부른다. 필요한 것은 NEON_API_KEY
// 하나뿐이다 — 프로젝트 ID는 키로 조회한다(NEON_PROJECT_ID로 지정도 가능).
let neon = { configured: false, error: "NEON_API_KEY 미설정" };
const neonKey = clean(process.env.NEON_API_KEY);
const neonProject = clean(process.env.NEON_PROJECT_ID);
if (neonKey) {
  const auth = { headers: { Accept: "application/json", Authorization: `Bearer ${neonKey}` } };
  try {
    // 프로젝트 ID는 연결 문자열에 없다(거기 있는 건 엔드포인트 이름이다).
    // 키만으로 목록을 받아 올 수 있으므로, 사람이 콘솔에서 적어 와야 하는 것은
    // 키 하나로 줄인다. 여럿이면 고르지 않고 목록을 보여 준다.
    let projectId = neonProject;
    if (!projectId) {
      const list = await get("https://console.neon.tech/api/v2/projects", auth);
      const picked = pickNeonProject(list?.projects);
      if (!picked.id) throw new Error(picked.error);
      projectId = picked.id;
    }
    const body = await get(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}`, auth);
    neon = { configured: true, projectId, dataTransferBytes: Number(body.project?.data_transfer_bytes || 0) };
  } catch (error) {
    // 못 읽은 것을 0으로 두지 않는다 — 0GB는 "안전하다"로 읽힌다
    neon = { configured: true, error: `Neon API 조회 실패: ${error.message}` };
  }
}

// 어제의 AI 호출. DATABASE_URL이 있을 때만 — 없으면 그 줄을 빼고 나머지를 보고한다.
let ai = null;
const databaseUrl = clean(process.env.DATABASE_URL);
if (databaseUrl) {
  try {
    const { neon: connect } = await import("@neondatabase/serverless");
    const { readAiUsageFor } = await import("../lib/admin/research-budget-db.js");
    const sql = connect(databaseUrl);
    const yesterday = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" })
      .format(new Date(Date.now() - 24 * 60 * 60 * 1000));
    ai = await readAiUsageFor(sql, yesterday);
  } catch (error) {
    ai = { total: 0, phases: {}, error: error.message };
  }
}

const result = evaluateQuota({ version, health, neon, ai });
const report = renderQuotaReport(result);

if (asJson) {
  console.log(JSON.stringify({ ...result, report }, null, 2));
} else {
  console.log(report);
}

// 수집 자체가 실패했으면(사이트를 못 읽음) 경보와 구분한다 — 원인이 다르다.
if (!version) process.exitCode = 1;
else if (result.alert) process.exitCode = 2;
