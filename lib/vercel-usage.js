// Vercel Hobby 한도와, 가능하면 공급자 실측값.
//
// ── 엔드포인트 확인 기록 (2026-09-11, 실제 호출로 확인) ───────────────────
// GET https://api.vercel.com/v1/usage
//   · from, to 필수. **ISO 8601 문자열**이어야 한다 —
//     epoch ms를 주면 {"error":{"code":"invalid_from_date"}}로 거부한다.
//   · teamId 선택. Authorization: Bearer <token>.
//   · 인자가 없으면 {"code":"bad_request","message":"missing required property `from`"}
//     → 엔드포인트가 실재한다는 근거다.
//
// **응답 필드는 검증하지 못했다.** 확인에 쓸 수 있었던 로컬 CLI 토큰이 만료
// 상태라(`invalidToken: true`) 200 응답을 한 번도 받지 못했다. 그래서 아래
// 파서는 "이럴 것이다" 하고 필드명을 박지 않는다 — 알려진 후보 이름을 훑어보고
// 하나도 못 찾으면 실측 실패로 처리한다. 추정치를 실측처럼 보여주는 것이
// 이 모듈이 절대 하지 말아야 할 일이다.
//
// ── Hobby 한도 (2026-09-11 기준, vercel.com/docs/limits) ──────────────────
// 숫자가 바뀌면 환경변수로 덮어쓴다. 공급자가 조용히 바꾸는 값이라 코드에
// 박아 두고 잊으면 경보가 거짓말을 하게 된다.
export const VERCEL_HOBBY_LIMITS = {
  activeCpuHours: 4,
  invocations: 1_000_000,
  fastDataTransferBytes: 100 * 1000 * 1000 * 1000, // 100GB
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function vercelLimits(env = {}) {
  return {
    activeCpuHours: num(env.LYRA_VERCEL_LIMIT_CPU_HOURS) ?? VERCEL_HOBBY_LIMITS.activeCpuHours,
    invocations: num(env.LYRA_VERCEL_LIMIT_INVOCATIONS) ?? VERCEL_HOBBY_LIMITS.invocations,
    fastDataTransferBytes: num(env.LYRA_VERCEL_LIMIT_TRANSFER_BYTES) ?? VERCEL_HOBBY_LIMITS.fastDataTransferBytes,
  };
}

// 응답 어디에 숫자가 있는지 모르므로 이름으로 찾는다. 중첩도 얕게 훑는다.
// 못 찾으면 null — 0이 아니다. 0은 "안 썼다"로 읽히고 그건 안전하다는 뜻이 된다.
const CANDIDATES = {
  activeCpuHours: ["activeCpuHours", "active_cpu_hours", "activeCpu", "cpuHours"],
  invocations: ["invocations", "functionInvocations", "function_invocations", "serverlessFunctionExecution"],
  fastDataTransferBytes: ["fastDataTransfer", "fastDataTransferBytes", "dataTransfer", "bandwidth"],
};

function findNumber(body, names, depth = 0) {
  if (!body || typeof body !== "object" || depth > 3) return null;
  for (const name of names) {
    const value = body[name];
    if (typeof value === "number") return num(value);
    // { total: 123 } / { value: 123 } 형태도 흔하다
    if (value && typeof value === "object") {
      const inner = num(value.total ?? value.value ?? value.used);
      if (inner !== null) return inner;
    }
  }
  for (const value of Object.values(body)) {
    if (value && typeof value === "object") {
      const found = findNumber(value, names, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

export function parseVercelUsage(body) {
  const out = {};
  for (const [key, names] of Object.entries(CANDIDATES)) out[key] = findNumber(body, names);
  const measured = Object.values(out).some((value) => value !== null);
  return { measured, ...out };
}

export const vercelUsageUrl = ({ from, to, teamId = "" }) => {
  const params = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  if (teamId) params.set("teamId", teamId);
  return `https://api.vercel.com/v1/usage?${params}`;
};

// 실패는 전부 "실측 불가"로 수렴한다. 호출자는 source를 보고 라벨을 고른다.
export async function readVercelUsage({ env = {}, at = new Date(), fetchImpl = fetch } = {}) {
  const token = String(env.LYRA_VERCEL_TOKEN || "").trim();
  if (!token) {
    return { source: "none", measured: false, error: "LYRA_VERCEL_TOKEN이 없어 실측할 수 없습니다." };
  }
  const to = at instanceof Date ? at : new Date(at);
  // 이번 달 1일부터 — Hobby 한도는 월 단위다
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  const teamId = String(env.LYRA_VERCEL_TEAM_ID || env.VERCEL_TEAM_ID || "").trim();
  try {
    const response = await fetchImpl(vercelUsageUrl({ from, to, teamId }), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { source: "none", measured: false, error: `Vercel API ${response.status}${detail ? ` — ${detail.slice(0, 120)}` : ""}` };
    }
    const parsed = parseVercelUsage(await response.json());
    if (!parsed.measured) {
      return { source: "none", measured: false, error: "Vercel 응답에서 사용량 필드를 찾지 못했습니다." };
    }
    return { source: "vercel-api", measuredAt: to.toISOString(), ...parsed };
  } catch (error) {
    return { source: "none", measured: false, error: `Vercel API 조회 실패: ${error.message}` };
  }
}

// 화면에 붙일 라벨. 실측과 추정을 절대 같은 문구로 쓰지 않는다.
export function usageSourceLabel(usage, { at = new Date() } = {}) {
  if (usage?.source === "vercel-api") {
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(usage.measuredAt || at));
    return `출처: Vercel API, ${day}`;
  }
  return "출처: 자체 추정";
}
