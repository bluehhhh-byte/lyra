"use client";
import { useState } from "react";

// 대량 작업 — Gemini 무료 티어로는 768곡을 훑을 수 없다. 그래서 역할을 나눈다:
//   여기서 '무엇이 부족한지' 목록(작업 꾸러미)만 만들고,
//   실제 문장은 Claude·ChatGPT가 밖에서 채워 온 뒤 그 결과를 여기에 올린다.
// 이 화면은 외부 AI를 한 번도 부르지 않는다 — 계획과 검증만 한다.
const FIELDS = [
  ["", "부족한 게 있는 곡 전부"],
  ["keywords", "키워드"],
  ["emotion", "감정"],
  ["comment", "코멘트"],
  ["title_ko", "한글 제목"],
  ["reading", "독음 (일본어)"],
  ["genre", "장르"],
  ["year", "연도"],
  ["artwork", "커버"],
];

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

export default function BulkWork() {
  const [field, setField] = useState("");
  const [plan, setPlan] = useState(null);
  const [paste, setPaste] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const makePlan = async () => {
    setBusy(true); setErr(""); setResult(null);
    try { setPlan(await api("bulkPlan", { field })); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(plan, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lyra-작업꾸러미-${plan.field}-${plan.count}곡.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const apply = async () => {
    setBusy(true); setErr(""); setResult(null);
    try {
      const parsed = JSON.parse(paste);
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(items)) throw new Error("items 배열이 필요합니다");
      setResult(await api("bulkApply", { items }));
      setPaste("");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        전 곡 대상 작업은 여기서 <b>목록만</b> 만들고, 문장은 Claude·ChatGPT가 채워 온다.
        Gemini는 새 곡 하나를 넣을 때의 번역·독음·코멘트에만 쓴다.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select value={field} onChange={(e) => setField(e.target.value)}
          className="rounded border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent">
          {FIELDS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button onClick={makePlan} disabled={busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">
          {busy ? "세는 중…" : "부족한 곡 세기"}
        </button>
        {plan && (
          <button onClick={download}
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-accent">
            작업 꾸러미 내려받기 ({plan.count}곡)
          </button>
        )}
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {plan && (
        <div className="rounded-lg border border-line p-3 text-sm">
          <p className="mb-2">
            <b>{plan.field}</b> — 전체 {plan.total}곡 중 <b>{plan.count}곡</b>에 부족한 항목이 있다.
          </p>
          <div className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted">
            {plan.items.slice(0, 40).map((it) => (
              <div key={it.slug} className="truncate">
                {it.artist} — {it.title} <span className="text-muted/60">· {it.needs.join(" · ")}</span>
              </div>
            ))}
            {plan.count > 40 && <div>… 외 {plan.count - 40}곡 (내려받은 파일에 전부 있다)</div>}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs text-muted">
          채워 온 결과 붙여넣기 — {`{"items":[{"slug":"...","keywords":["..."],"emotion":"..."}]}`}
        </p>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} spellCheck={false}
          placeholder="Claude·ChatGPT가 만든 JSON"
          className="w-full resize-y rounded border border-line bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-accent" />
        <button onClick={apply} disabled={busy || !paste.trim()}
          className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">
          {busy ? "반영 중…" : "검증하고 반영"}
        </button>
      </div>

      {result && (
        <div className="rounded-lg border border-line p-3 text-sm">
          <p>반영 {result.applied}곡 · 항목 {(result.fields || []).join(", ") || "—"}</p>
          {!!result.rejected?.length && (
            <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs text-red-400/90">
              {result.rejected.map((r, i) => <div key={i}>거부: {r.slug} — {r.why}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
