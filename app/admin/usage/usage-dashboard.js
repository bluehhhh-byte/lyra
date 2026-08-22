"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
const REFRESH_MS = 30_000;

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1_000_000_000) return `${number.format(value / 1_000_000_000)} GB`;
  if (value >= 1_000_000) return `${number.format(value / 1_000_000)} MB`;
  if (value >= 1_000) return `${number.format(value / 1_000)} KB`;
  return `${number.format(value)} B`;
}

function percent(value, limit) {
  if (!limit) return 0;
  return Math.max(0, Math.min(100, (Number(value || 0) / limit) * 100));
}

function Metric({ label, value, detail, tone = "" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/70 p-4 sm:p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}
function Progress({ value, limit, label }) {
  const used = percent(value, limit);
  const color = used >= 80 ? "bg-red-500" : used >= 60 ? "bg-amber-500" : "bg-accent";
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[11px] text-muted">
        <span>{label}</span><span className="tabular-nums">{number.format(used)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line/70">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${used}%` }} />
      </div>
    </div>
  );
}

function LineChart({ title, subtitle, points, valueKey, formatValue, color = "var(--color-accent)" }) {
  const values = points.map((item) => Number(item[valueKey] || 0));
  const max = Math.max(...values, 1);
  const width = 720;
  const height = 190;
  const pad = 16;
  const path = values.map((value, index) => {
    const x = values.length <= 1 ? pad : pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - (value / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const latest = values.at(-1) || 0;

  return (
    <section className="rounded-2xl border border-line bg-surface/50 p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-muted">{subtitle}</p></div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">{formatValue(latest)}</p>
      </div>
      <div className="overflow-hidden rounded-xl bg-bg/60">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label={`${title} 최근 24시간 그래프`}>
          <title>{title} 최근 24시간</title>
          {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1={pad} x2={width - pad} y1={height * ratio} y2={height * ratio} stroke="var(--color-line)" strokeWidth="1" />)}
          {path && <polyline points={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted/70"><span>24시간 전</span><span>현재</span></div>
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

  const vercelPoints = recent.map((item) => ({ ...item, megabytes: item.vercelTransferBytes / 1_000_000 }));
  const neonPoints = recent.map((item) => ({ ...item, kilobytes: item.neonTransferBytes / 1_000 }));
  const neonMonthly = data?.neonProvider?.dataTransferBytes;
  const neonDisplayed = Number.isFinite(neonMonthly) ? neonMonthly : data?.totals7d?.neonTransferBytes || 0;

  return (
    <div className="pb-16">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-xs text-muted hover:text-accent">← 관리자</Link>
          <div className="mt-3 flex items-center gap-2">
            <h1 className="text-2xl font-bold">인프라 사용량</h1>
            <span className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-[10px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />30초 갱신
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">Vercel 전송량 추정과 Neon 읽기·저장공간을 한 화면에서 봅니다.</p>
        </div>
        <button onClick={refresh} disabled={loading} className="rounded-full border border-line px-4 py-2 text-xs hover:border-accent hover:text-accent disabled:opacity-50">
          {loading ? "읽는 중…" : "지금 갱신"}
        </button>
      </div>

      {error && <p className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface/70 p-4 sm:p-5">
          <p className="text-xs text-muted">Vercel 전송 · 24시간</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatBytes(data?.totals24h?.vercelTransferBytes)}</p>
          <p className="mt-1 text-xs leading-5 text-muted">브라우저 10% 표본을 전체로 환산</p>
          <Progress value={data?.totals7d?.vercelTransferBytes} limit={data?.limits?.vercelTransferBytes} label="관측 7일 / 월 100GB" />
        </div>
        <Metric label="페이지 조회 · 24시간" value={number.format(data?.totals24h?.vercelPageViews || 0)} detail="JS가 실행된 실제 방문의 추정치" />
        <div className="rounded-2xl border border-line bg-surface/70 p-4 sm:p-5">
          <p className="text-xs text-muted">Neon 전송</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatBytes(neonDisplayed)}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{Number.isFinite(neonMonthly) ? "공식 월 누적값" : "Lyra가 관측한 최근 7일"}</p>
          <Progress value={neonDisplayed} limit={data?.limits?.neonTransferBytes} label="월 5GB 한도" />
        </div>
        <div className="rounded-2xl border border-line bg-surface/70 p-4 sm:p-5">
          <p className="text-xs text-muted">Neon 저장공간</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatBytes(data?.databaseBytes)}</p>
          <p className="mt-1 text-xs leading-5 text-muted">Postgres 전체 데이터베이스</p>
          <Progress value={data?.databaseBytes} limit={data?.limits?.neonStorageBytes} label="0.5GB 한도" />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <LineChart title="Vercel 전송량" subtitle="5분 단위 · 브라우저 관측 추정" points={vercelPoints} valueKey="megabytes" formatValue={(v) => `${number.format(v)} MB`} />
        <LineChart title="Neon 읽기 전송량" subtitle="5분 단위 · 캐시 미스 실측" points={neonPoints} valueKey="kilobytes" formatValue={(v) => `${number.format(v)} KB`} color="oklch(0.72 0.13 180)" />
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {!data?.neonProvider?.configured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-muted">
            <strong className="text-ink">Neon 공식 누적값 미연결</strong><br />
            `NEON_API_KEY`를 설정하면 월 5GB 사용량이 정확한 공급자 값으로 바뀝니다. 프로젝트 ID는 DB에서 자동 확인합니다.
          </div>
        )}
        <div className="rounded-xl border border-line px-4 py-3 text-xs leading-5 text-muted">
          <strong className="text-ink">Vercel Hobby 측정 범위</strong><br />
          Hobby는 Usage API를 제공하지 않아 봇·JS 차단 방문은 제외됩니다. 정확한 청구 수치는 Vercel Usage 화면에서 확인합니다.
        </div>
      </div>

      <p className="mt-4 text-right text-[10px] text-muted/70">
        마지막 갱신 {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("ko-KR") : "—"}
      </p>
    </div>
  );
}
