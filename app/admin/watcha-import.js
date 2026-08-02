"use client";
import { useState } from "react";

async function api(action, body) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// 왓챠 별점 JSON을 붙여넣어 평가 데이터셋(data/watcha-movies.json)에 code로 병합.
// 개별 영화 페이지를 만들지 않는다 — 취향 분석·목록의 원천만 채운다.
export default function WatchaImport() {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);

  const genReport = async () => {
    setError("");
    setReportBusy(true);
    try {
      setReport(await api("tasteReport", {}));
    } catch (e) {
      setError(e.message);
    } finally {
      setReportBusy(false);
    }
  };

  const genRecs = async () => {
    setError("");
    setReportBusy(true);
    try {
      const r = await api("tasteRecs", {});
      setReport({ text: `새 추천 ${r.added}편 추가 (누적 ${r.total}편). 추천 영화 메뉴에서 확인.` });
    } catch (e) {
      setError(e.message);
    } finally {
      setReportBusy(false);
    }
  };

  const run = async () => {
    setError("");
    setResult(null);
    let items;
    try {
      items = JSON.parse(raw);
      if (!Array.isArray(items)) throw new Error("JSON 배열이 아닙니다");
    } catch (e) {
      setError(`JSON을 읽을 수 없습니다 — ${e.message}`);
      return;
    }
    const withRating = items.filter((i) => i?.code && i?.rating != null);
    if (!withRating.length) {
      setError("별점(rating)과 code가 있는 항목이 없습니다. 별점 목록 페이지에서 뽑았는지 확인하세요.");
      return;
    }
    setBusy(true);
    try {
      setResult(await api("watchaRatings", { items: withRating }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={5}
        placeholder='왓챠 별점 목록에서 뽑은 JSON을 붙여넣으세요 — [{"code":"mW9pL6K","rating":4.5}, …]'
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={run}
          disabled={busy || !raw.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
        >
          {busy ? "병합 중…" : "별점 병합"}
        </button>
        <span className="text-xs text-muted">
          code로 데이터셋에 별점을 채웁니다 — 영화 페이지를 새로 만들지 않습니다
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
        <button
          onClick={genReport}
          disabled={reportBusy}
          className="rounded-lg border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent hover:text-bg disabled:opacity-40"
        >
          {reportBusy ? "분석 중…" : "취향 리포트 생성"}
        </button>
        <button
          onClick={genRecs}
          disabled={reportBusy}
          className="rounded-lg border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent hover:text-bg disabled:opacity-40"
        >
          {reportBusy ? "…" : "추천 20편 생성"}
        </button>
        <span className="text-xs text-muted">Gemini가 별점을 분석해 리포트·추천을 답니다</span>
      </div>
      {report?.text && (
        <div className="mt-3 rounded-lg border border-line bg-surface/40 px-4 py-3 text-sm leading-relaxed">
          <p className="mb-2 text-xs text-green-400">✓ {report.count}편 기준 리포트 생성됨</p>
          <p className="whitespace-pre-wrap text-muted">{report.text.slice(0, 200)}…</p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400 dark:text-red-400">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg border border-line px-4 py-3 text-sm">
          <p>
            <span className="font-semibold text-green-400">{result.changed}편</span> 별점 갱신
            <span className="text-muted"> · 매칭 {result.matched} / 입력 {result.total}</span>
          </p>
          {result.unknown > 0 && (
            <p className="mt-1 text-xs text-muted">
              데이터셋에 없는 {result.unknown}편은 건너뜀 (시리즈·책이거나 미등록)
            </p>
          )}
          {result.changed > 0 && (
            <p className="mt-1 text-xs text-muted">
              →{" "}
              <a href="/watched/taste" className="text-accent hover:underline">취향 분석</a> ·{" "}
              <a href="/watched" className="text-accent hover:underline">목록</a> 에서 확인
            </p>
          )}
        </div>
      )}
    </div>
  );
}
