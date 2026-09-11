// 매일 한 번 무료티어 지표를 모아 "지금 괜찮은가"를 판정하고 사람이 읽을
// 리포트를 만든다. 워크플로는 이 함수들을 부르기만 한다 — 판정 규칙이 YAML 안에
// 흩어지면 테스트할 수 없고, 고칠 때마다 워크플로를 실행해 봐야 한다.
//
// 소진된 뒤가 아니라 소진 전에 알리는 것이 목적이라 임계는 셋이다. 근거:
// Neon Free는 월 전송 5GB를 넘기면 다음 주기까지 compute가 멈춘다 — 넘고 나서
// 아는 것은 의미가 없다(2026-08-22에 실제로 겪었다: 모든 DB 읽기가 402,
// 빌드가 sitemap에서 죽어 배포까지 막혔다). 기준일 2026-09-11.
export const QUOTA_THRESHOLDS = [
  { level: "notice", at: 0.5, label: "절반" },
  { level: "warning", at: 0.7, label: "70%" },
  { level: "danger", at: 0.85, label: "85%" },
];

// 이 비율을 넘으면 이슈를 만든다. notice는 리포트에만 남긴다 — 매달 중순이면
// 절반은 정상적으로 지나가는 지점이라 이슈로 만들면 경보가 소음이 된다.
export const ALERT_AT = 0.7;

export const LIMITS = {
  // Neon Free: 저장 0.5GB, 전송 5GB/월 (docs, 2026-08-23 FREE_TIER_AUDIT 기준)
  neonTransferBytes: 5 * 1000 * 1000 * 1000,
};

const ratio = (used, limit) => (limit > 0 ? Number(used || 0) / limit : 0);

export function thresholdFor(used, limit) {
  const r = ratio(used, limit);
  let hit = { level: "ok", at: 0, label: "" };
  for (const t of QUOTA_THRESHOLDS) if (r >= t.at) hit = t;
  return { ...hit, ratio: r, used: Number(used || 0), limit };
}

const pct = (r) => `${(r * 100).toFixed(1)}%`;
const gb = (bytes) => `${(Number(bytes || 0) / 1e9).toFixed(2)}GB`;

// 판정 — 무엇 하나라도 걸리면 alert. 이유는 사람이 읽을 문장으로 남긴다.
export function evaluateQuota({ version, health, neon, ai } = {}) {
  const reasons = [];
  const checks = [];

  // 1. 파일 폴백 — DB가 죽어 백업으로 읽는 중. 즉시 사유다.
  const fallback = Boolean(version?.contentFallback);
  checks.push({ name: "콘텐츠 저장소", ok: !fallback, detail: fallback ? `파일 폴백 동작 중 (${version?.contentStore || "unknown"})` : version?.contentStore || "unknown" });
  if (fallback) reasons.push("Neon 응답이 없어 파일 백업에서 읽는 중입니다.");

  // 2. 헬스체크
  const healthy = health?.ok !== false;
  checks.push({ name: "헬스체크", ok: healthy, detail: health?.message || "실행되지 않음" });
  if (!healthy) reasons.push(`헬스체크 실패: ${health?.message || "사유 미상"}`);

  // 3. Neon 월 전송량
  const transfer = thresholdFor(neon?.dataTransferBytes, LIMITS.neonTransferBytes);
  const transferKnown = neon?.configured !== false && neon?.dataTransferBytes != null;
  checks.push({
    name: "Neon 월 전송량",
    ok: !transferKnown || transfer.ratio < ALERT_AT,
    detail: transferKnown
      ? `${gb(transfer.used)} / ${gb(transfer.limit)} (${pct(transfer.ratio)})`
      : neon?.error || "실측 불가 — NEON_API_KEY 미설정",
  });
  if (transferKnown && transfer.ratio >= ALERT_AT) {
    reasons.push(`Neon 월 전송량이 ${pct(transfer.ratio)}입니다 (${gb(transfer.used)} / ${gb(transfer.limit)}). 5GB를 넘기면 다음 주기까지 compute가 멈춥니다.`);
  }

  // 4. Data Cache payload — 2MiB를 넘으면 unstable_cache가 조용히 저장을 건너뛴다
  const payload = version?.cachePayload;
  const payloadRatio = payload?.measured ? ratio(payload.bytes, payload.limit) : 0;
  checks.push({
    name: "Data Cache payload",
    ok: !payload?.measured || payloadRatio < 0.9,
    detail: payload?.measured ? `${(payload.bytes / 1e6).toFixed(2)}MB / ${(payload.limit / 1e6).toFixed(2)}MB (${pct(payloadRatio)})` : "측정 없음",
  });
  if (payload?.measured && payloadRatio >= 0.9) {
    reasons.push(`Data Cache payload가 한도의 ${pct(payloadRatio)}입니다. 넘기면 캐시가 조용히 꺼지고 매 요청이 DB를 읽습니다.`);
  }

  // 5. 어제의 AI 호출 — 경보 사유는 아니고 흐름을 본다
  if (ai) checks.push({ name: "어제 AI 호출", ok: true, detail: `${ai.total}회 (${Object.entries(ai.phases || {}).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(" · ") || "없음"})` });

  return { alert: reasons.length > 0, reasons, checks, transfer };
}

export function renderQuotaReport(result, { at = new Date() } = {}) {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(at);
  const lines = [
    `# 무료티어 점검 · ${day} (KST)`,
    "",
    result.alert ? "**경보** — 아래 사유를 확인해야 합니다." : "이상 없음.",
    "",
    "| 항목 | 상태 | 값 |",
    "| --- | --- | --- |",
    ...result.checks.map((c) => `| ${c.name} | ${c.ok ? "정상" : "확인 필요"} | ${c.detail} |`),
  ];
  if (result.reasons.length) {
    lines.push("", "## 사유", ...result.reasons.map((r) => `- ${r}`));
  }
  return lines.join("\n");
}

// 같은 사유의 열린 이슈가 있으면 새로 만들지 않는다 — 매일 도는 워크플로라
// 그냥 만들면 같은 이슈가 한 달에 서른 개 쌓인다.
export const QUOTA_ISSUE_TITLE = "무료티어 한도 경보";
