"use client";
import { useState } from "react";

async function api(action, body) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Scans every song for format defects (untranslated lines, missing readings,
// inline ">"/"+" markers), then can auto-fix them — one request per song so a
// slow Gemini call never hits the serverless timeout.
export default function Lint() {
  const [report, setReport] = useState(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(""); // "" | "scan" | "fix"
  const [error, setError] = useState("");
  const [fixLog, setFixLog] = useState({}); // slug → result line

  const scan = async () => {
    setBusy("scan");
    setError("");
    setFixLog({});
    try {
      const data = await api("lint");
      setReport(data.report);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const fixAll = async () => {
    setBusy("fix");
    setError("");
    const log = (slug, msg) => setFixLog((o) => ({ ...o, [slug]: msg }));
    for (const s of report) {
      log(s.slug, "수정 중…");
      try {
        const { fixed } = await api("lintFix", { slug: s.slug });
        log(s.slug, fixed.length ? `✓ ${fixed.join(" · ")}` : "수정할 항목 없음");
      } catch (e) {
        log(s.slug, `✗ ${e.message}`);
      }
    }
    setBusy("");
  };

  return (
    <div className="max-w-2xl">
      <p className="mb-3 text-sm text-muted">
        전 곡의 번역 형식을 검사한다 — 번역 빠진 줄, 독음 빠진 일본어 줄, 원문에 붙어버린{" "}
        <code>&gt;</code>/<code>+</code> 마커. 자동 수정은 누락된 줄만 채우고 기존 번역은 건드리지
        않는다.
      </p>
      <div className="flex gap-2">
        <button
          onClick={scan}
          disabled={!!busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
        >
          {busy === "scan" ? "검사 중…" : "형식 검사 실행"}
        </button>
        {report?.length > 0 && (
          <button
            onClick={fixAll}
            disabled={!!busy}
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-accent disabled:opacity-40"
          >
            {busy === "fix" ? "수정 중…" : `발견된 ${report.length}곡 자동 수정`}
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {report && report.length === 0 && (
        <p className="mt-3 text-sm text-muted">전 {total}곡 형식 이상 없음 ✓</p>
      )}
      {report?.length > 0 && (
        <>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {report.map((s) => (
              <li key={s.slug} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{s.title}</span>
                  <span className="text-muted"> — {s.artist}</span>
                  <span className="block text-xs text-red-600 dark:text-red-400">
                    {s.issues.join(" · ")}
                  </span>
                  {fixLog[s.slug] && (
                    <span className="block text-xs text-accent">{fixLog[s.slug]}</span>
                  )}
                </span>
                <a
                  href={`/admin/edit/${s.slug}`}
                  className="shrink-0 text-xs text-accent hover:underline"
                >
                  수정 →
                </a>
              </li>
            ))}
          </ul>
          {Object.keys(fixLog).length > 0 && busy !== "fix" && (
            <p className="mt-2 text-xs text-muted">
              온라인 배포본은 재배포(약 1분) 후 반영. 반영 뒤 다시 검사하면 결과가 갱신된다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
