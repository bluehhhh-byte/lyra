"use client";
import { useState } from "react";

// Scans every song for format defects (untranslated lines, missing readings,
// inline ">"/"+" markers) — one request, pure parsing, no external calls.
export default function Lint() {
  const [report, setReport] = useState(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lint" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReport(data.report);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <p className="mb-3 text-sm text-muted">
        전 곡의 번역 형식을 검사한다 — 번역 빠진 줄, 독음 빠진 일본어 줄, 원문에 붙어버린{" "}
        <code>&gt;</code>/<code>+</code> 마커.
      </p>
      <button
        onClick={run}
        disabled={busy}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
      >
        {busy ? "검사 중…" : "형식 검사 실행"}
      </button>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {report && report.length === 0 && (
        <p className="mt-3 text-sm text-muted">전 {total}곡 형식 이상 없음 ✓</p>
      )}
      {report?.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {report.map((s) => (
            <li key={s.slug} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{s.title}</span>
                <span className="text-muted"> — {s.artist}</span>
                <span className="block text-xs text-red-600 dark:text-red-400">
                  {s.issues.join(" · ")}
                </span>
              </span>
              <a href={`/admin/edit/${s.slug}`} className="shrink-0 text-xs text-accent hover:underline">
                수정 →
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
