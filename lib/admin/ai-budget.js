// 하루에 쓸 AI 호출을 기능별로 나눠 담는 저울.
//
// 지금까지 일일 예산은 곡 연구(appearance)에만 걸려 있었다. 나머지 Gemini
// 호출 — 곡 번역·키워드·감정, 영화 메타, 캐러셀 문구 — 은 한도 없이 나갔고,
// 그쪽이 먼저 계정 한도를 태우면 "오늘 곡 하나 올리기"가 통째로 막혔다.
//
// 그래서 두 겹으로 막는다. 기능마다 제 몫이 있어 한 기능이 하루치를 다 쓰지
// 못하고, 그 위에 계정 합산 상한이 있어 합쳐서도 넘지 못한다.
//
// 숫자의 출처: Gemini Developer API Free tier는 모델마다 RPM/RPD 버킷이 다르고
// 공지 없이 바뀐다(2026-09-05에 그라운딩 검색 한도가 먼저 소진된 사례가
// lib/admin/gemini.js 주석에 있다). 그래서 아래 값은 공급자 한도의 복제가 아니라
// "이 사이트가 하루에 쓰기로 정한 몫"이다 — 공급자가 조여도 우리가 먼저 멈춘다.
// 기준일 2026-09-11.
export const AI_PHASES = ["research", "song", "movie", "carousel"];

export const AI_PHASE_LABEL = {
  research: "곡 연구",
  song: "곡 번역·메타",
  movie: "영화 메타",
  carousel: "캐러셀 문구",
};

export const DEFAULT_AI_PHASE_LIMITS = {
  research: 25, // 현행 DEFAULT_APPEARANCE_AI_DAILY_LIMIT과 같은 값
  song: 40,
  movie: 20,
  carousel: 20,
};

// 기능별 몫을 다 더하면 105지만 계정 상한은 80이다. 일부러 낮게 둔다 — 하루에
// 네 기능을 골고루 쓰는 날은 없고, 한 기능이 제 몫을 다 쓰더라도 다른 기능이
// 쓸 자리를 남기는 편이 "곡 등록이 막히지 않는다"는 목표에 맞다.
export const DEFAULT_AI_ACCOUNT_LIMIT = 80;

const clampLimit = (value, fallback) => {
  const n = Number(value);
  return Math.floor(Math.max(0, Math.min(500, Number.isFinite(n) ? n : fallback)));
};

export const isAiPhase = (phase) => AI_PHASES.includes(String(phase));

// 환경변수로 덮어쓴다: LYRA_AI_DAILY_SONG=60, LYRA_AI_DAILY_ACCOUNT=120 …
export function aiBudgetLimits(env = {}) {
  const phases = {};
  for (const phase of AI_PHASES) {
    phases[phase] = clampLimit(env[`LYRA_AI_DAILY_${phase.toUpperCase()}`], DEFAULT_AI_PHASE_LIMITS[phase]);
  }
  return {
    phases,
    account: clampLimit(env.LYRA_AI_DAILY_ACCOUNT, DEFAULT_AI_ACCOUNT_LIMIT),
  };
}

// used: { research: 3, song: 12, ... } — 없는 기능은 0으로 본다.
export function aiBudgetStatus(used = {}, limits = aiBudgetLimits()) {
  const total = AI_PHASES.reduce((sum, phase) => sum + Math.max(0, Math.floor(Number(used[phase]) || 0)), 0);
  const accountRemaining = Math.max(0, limits.account - total);
  const phases = {};
  for (const phase of AI_PHASES) {
    const spent = Math.max(0, Math.floor(Number(used[phase]) || 0));
    const limit = limits.phases[phase] ?? 0;
    // 계정 잔량이 기능 잔량보다 적으면 실제로 쓸 수 있는 건 계정 잔량이다.
    const remaining = Math.min(Math.max(0, limit - spent), accountRemaining);
    phases[phase] = { phase, label: AI_PHASE_LABEL[phase], limit, used: spent, remaining, exhausted: remaining <= 0 };
  }
  return {
    phases,
    account: { limit: limits.account, used: total, remaining: accountRemaining, exhausted: accountRemaining <= 0 },
    exhausted: AI_PHASES.every((phase) => phases[phase].exhausted),
  };
}

// 예산이 없을 때 라우트가 돌려줄 몸통. 429는 쓰지 않는다 — 그건 공급자가
// 우리를 막았다는 뜻이고, 이건 우리가 스스로 멈춘 것이라 다른 사실이다.
export const AI_BUDGET_ERROR_CODE = "AI_BUDGET_EXHAUSTED";

export function aiBudgetExhaustedBody(phase, status, { resetAt = "" } = {}) {
  const row = status?.phases?.[phase];
  const accountFirst = status?.account?.exhausted && row && row.used < row.limit;
  return {
    error: accountFirst
      ? `오늘 쓰기로 한 AI 호출을 다 썼습니다 — ${AI_PHASE_LABEL[phase] || phase}의 몫은 남았지만 전체 상한(${status.account.limit}회)에 먼저 닿았습니다.`
      : `${AI_PHASE_LABEL[phase] || phase}의 오늘 몫(${row?.limit ?? 0}회)을 다 썼습니다.`,
    code: AI_BUDGET_ERROR_CODE,
    phase,
    used: row?.used ?? 0,
    limit: row?.limit ?? 0,
    account: status?.account ?? null,
    resetAt,
    // AI 없이도 등록은 되어야 한다 — 라우트가 이 문장을 그대로 화면에 띄운다.
    hint: "AI 없이 저장한 뒤 예산이 리셋되면 'AI 대기 목록'에서 마저 채울 수 있습니다.",
  };
}

// KST 자정에 리셋된다. 사람이 "언제 풀리나"를 바로 읽을 수 있게 ISO로 준다.
export function aiBudgetResetAt(at = new Date(), timeZone = "Asia/Seoul") {
  const now = at instanceof Date ? at : new Date(at);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const secondsIntoDay = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  return new Date(now.getTime() + (86400 - secondsIntoDay) * 1000).toISOString();
}
