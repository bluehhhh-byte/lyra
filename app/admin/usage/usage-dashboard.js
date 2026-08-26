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

const statusStyle = {
  safe: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-300", panel: "border-emerald-500/25 bg-emerald-500/5" },
  watch: { dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-300", panel: "border-sky-500/25 bg-sky-500/5" },
  warning: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-300", panel: "border-amber-500/30 bg-amber-500/5" },
  danger: { dot: "bg-red-500", text: "text-red-600 dark:text-red-300", panel: "border-red-500/30 bg-red-500/5" },
};

function Progress({ value, limit }) {
  const used = percent(value, limit);
  const color = used >= 85 ? "bg-red-500" : used >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mt-4">
      <div className="h-2 overflow-hidden rounded-full bg-line/70">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${used}%` }} />
      </div>
      <p className="mt-2 text-right text-[11px] tabular-nums text-muted">{number.format(used)}% 사용</p>
    </div>
  );
}

function ResourceCard({ label, used, limit, note }) {
  return (
    <section className="rounded-2xl border border-line bg-surface/70 p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{formatBytes(used)} {limit ? <span className="text-sm font-normal text-muted">/ {formatBytes(limit)}</span> : null}</p>
      {limit ? <Progress value={used} limit={limit} /> : <p className="mt-3 text-[11px] text-muted">환경변수에 현재 요금제 한도를 설정하면 비율을 계산합니다.</p>}
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
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
    <section className="rounded-2xl border border-line bg-surface/50 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[11px] text-muted">최근 24시간</span>
      </div>
      <div className="overflow-hidden rounded-xl bg-bg/60">
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
        <button onClick={refresh} disabled={loading} className="rounded-full border border-line px-4 py-2 text-xs hover:border-accent hover:text-accent disabled:opacity-50">
          {loading ? "확인 중…" : "새로고침"}
        </button>
      </div>

      <AdminErrorMessage message={error} className="mb-5" />

      <section className={`rounded-3xl border p-5 sm:p-7 ${style.panel}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
          <p className={`text-sm font-semibold ${style.text}`}>{data?.status?.label || "확인 중"}</p>
        </div>
        <p className="mt-3 text-sm text-muted">가사나 영화 콘텐츠를 지금과 같은 크기로 등록할 경우</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="text-4xl font-bold tabular-nums sm:text-5xl">{remaining == null ? "한도 설정 필요" : `약 ${integer.format(remaining)}회`}</p>
          <p className="pb-1 text-sm text-muted">더 등록 가능</p>
        </div>
        <div className="mt-6 h-3 overflow-hidden rounded-full bg-line/70">
          <div className={`h-full rounded-full ${style.dot}`} style={{ width: `${capacityUsed}%` }} />
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

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <ResourceCard label="DB 전송" used={neonMonthly} limit={data?.limits?.neonTransferBytes} note="이번 달" />
        <ResourceCard label="DB 저장" used={data?.databaseBytes} limit={data?.limits?.neonStorageBytes} note={`${integer.format(data?.contentRows || 0)}개 콘텐츠`} />
        <ResourceCard label="웹 전송" used={data?.totals7d?.vercelTransferBytes} limit={data?.limits?.vercelTransferBytes} note="최근 7일 관측" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <LineChart title="웹 사용 흐름" points={recent} valueKey="vercelTransferBytes" />
        <LineChart title="DB 사용 흐름" points={recent} valueKey="neonTransferBytes" color="oklch(0.72 0.13 180)" />
      </div>

      {data?.metricsEnabled && (
        <section className="mt-5 rounded-2xl border border-line bg-surface/50 p-4 sm:p-5">
          <h2 className="text-sm font-semibold">경로별 캐시 관측</h2>
          <p className="mt-1 text-xs text-muted">최근 7일 표본 · 전송 0 byte는 브라우저 HIT, 네트워크 전송은 MISS로 분류</p>
          <ol className="mt-3 divide-y divide-line text-xs">
            {(data.cachePaths || []).map((item) => (
              <li key={item.path} className="flex items-center gap-3 py-2">
                <code className="min-w-0 flex-1 truncate">{item.path}</code>
                <span className="text-emerald-600 dark:text-emerald-300">HIT {integer.format(item.hit)}</span>
                <span className="text-amber-600 dark:text-amber-300">MISS {integer.format(item.miss)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="mt-4 text-center text-[11px] leading-5 text-muted">등록 가능 횟수는 현재 콘텐츠 크기를 기준으로 한 예상치이며 30초마다 갱신됩니다.</p>
    </div>
  );
}
