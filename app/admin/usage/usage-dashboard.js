"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminErrorMessage from "../error-message";

const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const REFRESH_MS = 30_000;

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1_000_000_000) return `${number.format(value / 1_000_000_000)}GB`;
  if (value >= 1_000_000) return `${number.format(value / 1_000_000)}MB`;
  if (value >= 1_000) return `${number.format(value / 1_000)}KB`;
  return `${number.format(value)}B`;
}

function percent(value, limit) {
  if (!limit) return 0;
  return Math.max(0, Math.min(100, (Number(value || 0) / limit) * 100));
}

// 네 단계 모두 토큰으로 — 예전에는 팔레트를 직접 박고 dark: 변형을 달았는데,
// 그 변형은 OS 설정을 따라가고 이 사이트의 테마는 data-theme이 정한다. OS 라이트 +
// 사이트 다크(기본값)에서 어두운 배경에 라이트용 색이 얹혔다.
// watch는 전용 토큰이 없다 — "아직 위험은 아니나 보고 있다"는 단계라 사이트의
// 액센트를 쓴다. 면은 5~10% 워시까지만(상태색 규칙).
const statusStyle = {
  safe: { dot: "bg-ok", text: "text-ok", panel: "border-ok/25 bg-ok/5" },
  watch: { dot: "bg-accent", text: "text-accent", panel: "border-accent/25 bg-accent/5" },
  warning: { dot: "bg-warn", text: "text-warn", panel: "border-warn/30 bg-warn/5" },
  danger: { dot: "bg-danger", text: "text-danger", panel: "border-danger/30 bg-danger/5" },
};

function Progress({ value, limit }) {
  const used = percent(value, limit);
  const color = used >= 85 ? "bg-danger" : used >= 70 ? "bg-warn" : "bg-ok";
  return (
    <div className="mt-4">
      <div className="h-2 overflow-hidden  bg-line/70">
        <div className={`h-full  transition-all ${color}`} style={{ width: `${used}%` }} />
      </div>
      <p className="mt-2 text-right text-[11px] tabular-nums text-muted">{number.format(used)}% 사용</p>
    </div>
  );
}

function ResourceCard({ label, used, limit, note }) {
  return (
    <section className=" border border-line bg-surface/70 p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{formatBytes(used)} {limit ? <span className="text-sm font-normal text-muted">/ {formatBytes(limit)}</span> : null}</p>
      {limit ? <Progress value={used} limit={limit} /> : <p className="mt-3 text-[11px] text-muted">환경변수에 현재 요금제 한도를 설정하면 비율을 계산합니다.</p>}
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </section>
  );
}

// Vercel Hobby 한도. 실측을 읽었는지 아닌지를 값 옆에 그대로 적는다 —
// 추정치를 실측처럼 보여주면 "아직 여유 있다"는 잘못된 안심을 준다.
function VercelCard({ value }) {
  if (!value) return null;
  const measured = value.measured === true;
  const limits = value.limits || {};
  const rows = [
    { label: "Active CPU", used: value.activeCpuHours, limit: limits.activeCpuHours, unit: "시간", fmt: (n) => number.format(n) },
    { label: "함수 호출", used: value.invocations, limit: limits.invocations, unit: "회", fmt: (n) => integer.format(n) },
    { label: "Fast Data Transfer", used: value.fastDataTransferBytes, limit: limits.fastDataTransferBytes, unit: "", fmt: formatBytes },
  ];
  return (
    <section className="mt-5 border border-line bg-surface/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Vercel Hobby · 이번 달</h2>
        <p className={`text-[11px] ${measured ? "text-ok" : "text-warn"}`}>
          {measured ? `출처: Vercel API${value.measuredAt ? `, ${new Date(value.measuredAt).toLocaleDateString("ko-KR")}` : ""}` : "출처: 자체 추정"}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted">{value.note}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-xs text-muted">{row.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {row.used == null ? (
                <span className="text-sm font-normal text-warn">실측 불가</span>
              ) : (
                <>
                  {row.fmt(row.used)}{row.unit}
                  <span className="text-sm font-normal text-muted"> / {row.fmt(row.limit)}{row.unit}</span>
                </>
              )}
            </p>
            {row.used != null && <Progress value={row.used} limit={row.limit} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function AiResearchCard({ value }) {
  if (!value?.enabled) return null;
  const budget = value.budget || {};
  const checkpoint = value.checkpoint;
  const used = Number(budget.used || 0);
  const limit = Number(budget.limit || 0);
  const pending = Number(checkpoint?.pending || 0);
  // dark: 변형은 OS를 따라가는데 이 사이트의 테마는 data-theme이 정한다 — 토큰은
  // 테마 블록에서 값이 갈리므로 변형 없이 두 테마 모두 맞는다.
  const tone = budget.exhausted ? "text-warn" : "text-ok";
  const canResume = !budget.exhausted && !budget.providerBlocked && pending > 0;
  const budgetMessage = budget.providerBlocked
    ? "AI 공급자 할당량이 막혀 오늘 조사를 중단했습니다. 자정 이후 재개합니다."
    : budget.exhausted
      ? "오늘 상한에 도달했습니다. 자정 이후 이어집니다."
      : `${integer.format(budget.remaining || 0)}회 남음`;
  return (
    <section className="mt-5 border border-line bg-surface/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted">AI 전곡 수록 정보 조사 · 한국 시간</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            오늘 {integer.format(used)}회 <span className="text-sm font-normal text-muted">/ {integer.format(limit)}회</span>
          </p>
          <p className={`mt-1 text-xs ${tone}`}>
            {budgetMessage}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">재개 대기</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{checkpoint ? integer.format(pending) : "—"}<span className="ml-1 text-sm font-normal text-muted">곡</span></p>
        </div>
      </div>
      <Progress value={used} limit={limit} />
      <div className="mt-4 grid gap-2 border-t border-line/70 pt-4 text-xs text-muted sm:grid-cols-3">
        <p>전체 <strong className="text-ink">{checkpoint ? integer.format(checkpoint.totalSongs) : "—"}곡</strong></p>
        <p>검토 기록 <strong className="text-ink">{checkpoint ? integer.format(checkpoint.researched) : "—"}곡</strong></p>
        <p className="sm:text-right">최근 호출 <strong className="text-ink">{budget.lastSongSlug || "없음"}</strong></p>
      </div>
      <p className="mt-3 break-all text-[11px] text-muted">
        {checkpoint?.updatedAt ? `체크포인트 ${new Date(checkpoint.updatedAt).toLocaleString("ko-KR")}` : "첫 조사 실행 후 체크포인트가 표시됩니다."}
      </p>
      {/* 재개는 버튼이 아니라 명령이다. 전곡 조사는 수백 번의 Gemini 호출이라
          서버리스 함수에서 돌리면 실행 시간·동시성·예산이 한꺼번에 터진다 —
          감사 문서가 "대량 AI 작업은 로컬 스크립트로"를 원칙으로 둔 이유다.
          그래서 화면은 "지금 이어도 되는가"와 "어디서부터"만 말해 준다. */}
      {checkpoint && pending > 0 && (
        <div className="mt-4 border-t border-line/70 pt-4 text-xs">
          {canResume ? (
            <>
              <p className="text-muted">
                남은 <strong className="text-ink">{integer.format(pending)}곡</strong>은 로컬에서 이어서 조사합니다. 이미 끝낸 곡은 체크포인트가 건너뜁니다.
              </p>
              <code className="mt-1.5 block break-all bg-bg px-2 py-1.5 text-[11px] text-ink">
                pnpm appearances:resume
              </code>
            </>
          ) : (
            <p className="text-warn">
              지금은 이어서 돌릴 수 없습니다 —{" "}
              {budget.providerBlocked ? "AI 공급자가 호출을 막았습니다." : "오늘 몫을 다 썼습니다."}{" "}
              {value.resetAt && `${new Date(value.resetAt).toLocaleString("ko-KR")} 이후 다시 가능합니다.`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function LineChart({ title, points, valueKey, color = "var(--color-accent)" }) {
  const values = points.map((item) => Number(item[valueKey] || 0));
  const max = Math.max(...values, 1);
  const width = 720;
  const height = 150;
  const pad = 12;
  const path = values.map((value, index) => {
    const x = values.length <= 1 ? pad : pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - (value / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <section className=" border border-line bg-surface/50 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[11px] text-muted">최근 24시간</span>
      </div>
      <div className="overflow-hidden  bg-bg/60">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img" aria-label={`${title} 최근 24시간 그래프`}>
          {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1={pad} x2={width - pad} y1={height * ratio} y2={height * ratio} stroke="var(--color-line)" strokeWidth="1" />)}
          {path && <polyline points={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </div>
    </section>
  );
}

export default function UsageDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/usage", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setData(body);
      setError("");
    } catch (reason) {
      setError(reason.message || "사용량을 읽지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const recent = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return (data?.series || []).filter((item) => new Date(item.at).getTime() >= cutoff);
  }, [data]);

  const neonMonthly = Number(data?.neonProvider?.dataTransferBytes || 0);
  const style = statusStyle[data?.status?.level] || statusStyle.safe;
  const remaining = data?.capacity?.remainingUploads;
  const total = data?.capacity?.totalUploads;
  const capacityUsed = total ? Math.max(0, Math.min(100, ((total - remaining) / total) * 100)) : 0;

  return (
    <div className="pb-16">
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-xs text-muted hover:text-accent">← 관리자</Link>
          <h1 className="mt-3 text-2xl font-bold">무료 사용량</h1>
        </div>
        <button onClick={refresh} disabled={loading} className=" border border-line px-4 py-2 text-xs hover:border-accent hover:text-accent disabled:opacity-50">
          {loading ? "확인 중…" : "새로고침"}
        </button>
      </div>

      <AdminErrorMessage message={error} className="mb-5" />

      <section className={` border p-5 sm:p-7 ${style.panel}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5  ${style.dot}`} />
          <p className={`text-sm font-semibold ${style.text}`}>{data?.status?.label || "확인 중"}</p>
        </div>
        <p className="mt-3 text-sm text-muted">가사나 영화 콘텐츠를 지금과 같은 크기로 등록할 경우</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="text-4xl font-bold tabular-nums sm:text-5xl">{remaining == null ? "한도 설정 필요" : `약 ${integer.format(remaining)}회`}</p>
          <p className="pb-1 text-sm text-muted">더 등록 가능</p>
        </div>
        <div className="mt-6 h-3 overflow-hidden  bg-line/70">
          <div className={`h-full  ${style.dot}`} style={{ width: `${capacityUsed}%` }} />
        </div>
        <div className="mt-2 flex justify-between gap-3 text-xs text-muted">
          <span>{remaining == null ? "NEON_TRANSFER_LIMIT_BYTES 미설정" : `남음 ${integer.format(remaining)}회`}</span>
          <span>{total == null ? "공급자 사용량만 표시 중" : `전체 안전 기준 ${integer.format(total)}회`}</span>
        </div>
        <div className="mt-5 grid gap-2 border-t border-line/70 pt-4 text-xs text-muted sm:grid-cols-2">
          <p>1회 등록 후 갱신량 약 <strong className="text-ink">{formatBytes(data?.capacity?.uploadBytes)}</strong></p>
          <p className="sm:text-right">무료 한도의 80%까지를 안전 범위로 계산</p>
        </div>
      </section>

      <AiResearchCard value={data?.aiResearch} />

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <ResourceCard label="DB 전송" used={neonMonthly} limit={data?.limits?.neonTransferBytes} note="이번 달" />
        <ResourceCard label="DB 저장" used={data?.databaseBytes} limit={data?.limits?.neonStorageBytes} note={`${integer.format(data?.contentRows || 0)}개 콘텐츠`} />
        <ResourceCard label="웹 전송" used={data?.totals7d?.vercelTransferBytes} limit={data?.limits?.vercelTransferBytes} note="최근 7일 관측" />
      </div>

      <VercelCard value={data?.vercelProvider} />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <LineChart title="웹 사용 흐름" points={recent} valueKey="vercelTransferBytes" />
        <LineChart title="DB 사용 흐름" points={recent} valueKey="neonTransferBytes" color="oklch(0.72 0.13 180)" />
      </div>

      {data?.metricsEnabled && (
        <section className="mt-5  border border-line bg-surface/50 p-4 sm:p-5">
          <h2 className="text-sm font-semibold">경로별 캐시 관측</h2>
          <p className="mt-1 text-xs text-muted">최근 7일 표본 · 전송 0 byte는 브라우저 HIT, 네트워크 전송은 MISS로 분류</p>
          <ol className="mt-3 divide-y divide-line text-xs">
            {(data.cachePaths || []).map((item) => (
              <li key={item.path} className="flex items-center gap-3 py-2">
                <code className="min-w-0 flex-1 truncate">{item.path}</code>
                <span className="text-ok">HIT {integer.format(item.hit)}</span>
                <span className="text-warn">MISS {integer.format(item.miss)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="mt-4 text-center text-[11px] leading-5 text-muted">등록 가능 횟수는 현재 콘텐츠 크기를 기준으로 한 예상치이며 30초마다 갱신됩니다.</p>
    </div>
  );
}
