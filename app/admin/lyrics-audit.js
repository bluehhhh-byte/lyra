"use client";
import { useState } from "react";
import AdminErrorMessage from "./error-message";

// 가사 정확성 검토 — 인스타 캡션이 원본이지만, 캡션에 처음부터 오타나 잘못 들은
// 단어가 있었으면 무손실 검증으로는 잡히지 않는다. 여기서 공식 가사와 대조해
// 고치되, 고친 줄마다 근거를 남긴다. source_hash는 계속 인스타 원본을 가리키고
// 검증기는 근거가 있는 교정만 차이로 허용한다.
const TYPES = [
  ["original_typo", "오타"],
  ["original_missing", "누락"],
  ["original_duplicate", "중복"],
  ["line_split", "줄 분리"],
  ["version_mismatch", "버전 차이"],
  ["translation_wrong", "번역 오류"],
  ["translation_added", "번역 덧붙임"],
  ["translation_missing", "번역 누락"],
  ["caption_leak", "캡션 혼입"],
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

const bodyOf = (raw) => (raw.split(/\n---\n/)[1] ?? "").replace(/^\n/, "");
const headOf = (raw) => raw.slice(0, raw.length - bodyOf(raw).length);

export default function LyricsAudit() {
  const [queue, setQueue] = useState(null);
  const [view, setView] = useState("audit");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);   // {slug, raw, head, before, text}
  const [ref, setRef] = useState("");       // 참고 가사 (비교용 — 저장하지 않는다)
  const [type, setType] = useState("original_typo");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("");
  const [verify, setVerify] = useState(false);
  const [done, setDone] = useState({});
  const [evidenceDrafts, setEvidenceDrafts] = useState({});

  const loadQueue = async () => {
    setBusy(true); setErr("");
    try { setQueue(await api("auditQueue")); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const openSong = async (slug) => {
    setBusy(true); setErr(""); setRef(""); setReason(""); setSource(""); setVerify(false);
    try {
      const r = await api("auditSong", { slug });
      const b = bodyOf(r.raw);
      setOpen({ slug, head: headOf(r.raw), before: b, text: b, corrections: r.corrections });
      setEvidenceDrafts(Object.fromEntries(r.corrections.map((item) => [item.evidenceId, item.sourceUrl || ""])));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const saveEvidence = async (item) => {
    setBusy(true); setErr("");
    try {
      const saved = await api("auditEvidenceSave", {
        evidenceId: item.evidenceId,
        sourceUrl: evidenceDrafts[item.evidenceId] || "",
      });
      setOpen((current) => ({
        ...current,
        corrections: current.corrections.map((correction) => correction.evidenceId === item.evidenceId
          ? { ...correction, sourceUrl: saved.sourceUrl, evidenceState: saved.evidenceState }
          : correction),
      }));
      setQueue(await api("auditQueue"));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // 줄 단위 차이 — 왼쪽(현재 저장본)과 편집 중인 본문
  const diff = () => {
    if (!open) return [];
    const a = open.before.split("\n"), b = open.text.split("\n");
    const rows = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++)
      if ((a[i] ?? "") !== (b[i] ?? "")) rows.push({ i, before: a[i] ?? "", after: b[i] ?? "" });
    return rows;
  };

  const save = async () => {
    const rows = diff();
    if (!rows.length && !verify) { setErr("바뀐 줄도 없고 확인 표시도 없습니다"); return; }
    if (rows.length && !reason.trim()) { setErr("교정 사유를 적어주세요"); return; }
    setBusy(true); setErr("");
    try {
      await api("auditSave", {
        slug: open.slug,
        raw: open.head + open.text,
        corrections: rows.map((r) => ({
          type,
          field: r.before.startsWith(">") || r.after.startsWith(">") ? "translation" : "original",
          lineIndex: r.i,
          before: r.before,
          after: r.after,
          reason,
          sourceUrl: source,
        })),
        verifiedAt: verify ? new Date().toISOString().slice(0, 10) : "",
        source,
      });
      setDone((d) => ({ ...d, [open.slug]: rows.length ? `교정 ${rows.length}줄` : "현재 유지" }));
      setOpen(null);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const rows = diff();

  return (
    <div className="space-y-4">
      {!queue && (
        <button onClick={loadQueue} disabled={busy}
          className=" ink-action px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">
          {busy ? "불러오는 중…" : "검토 대상 불러오기"}
        </button>
      )}
      <AdminErrorMessage message={err} />

      {queue && !open && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className=" border border-line p-2"><b className="block text-base">{queue.evidence.summary.total}</b>전체 교정</div>
            <div className=" border border-emerald-500/40 bg-emerald-500/5 p-2"><b className="block text-base">{queue.evidence.summary.documented}</b>근거 완료</div>
            <div className=" border border-amber-500/50 bg-amber-500/10 p-2"><b className="block text-base">{queue.evidence.summary.missing + queue.evidence.summary.invalid}</b>근거 누락</div>
          </div>
          <div className="flex gap-2" role="tablist" aria-label="가사 감사 목록">
            <button onClick={() => setView("audit")} role="tab" aria-selected={view === "audit"}
              className={` px-3 py-1.5 text-xs ${view === "audit" ? "bg-accent font-semibold text-bg" : "border border-line text-muted"}`}>
              가사 검토 {queue.items.length}
            </button>
            <button onClick={() => setView("evidence")} role="tab" aria-selected={view === "evidence"}
              className={` px-3 py-1.5 text-xs ${view === "evidence" ? "bg-accent font-semibold text-bg" : "border border-line text-muted"}`}>
              근거 누락 {queue.evidence.items.length}
            </button>
          </div>
          <div className="max-h-[26rem] overflow-y-auto  border border-line">
          {view === "audit" && queue.items.map((q) => (
            <button key={q.slug} onClick={() => openSong(q.slug)}
              className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-surface">
              <span className="min-w-0 flex-1 truncate">
                {q.artist} — {q.title}
                <span className="ml-2 text-xs text-muted">{q.reasons.join(" · ")}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">
                {done[q.slug] || `${q.lines}줄`}
              </span>
            </button>
          ))}
          {view === "evidence" && queue.evidence.items.map((q) => (
            <button key={q.evidenceId} onClick={() => openSong(q.slug)}
              className="block w-full border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-surface">
              <span className="block truncate">{q.artist || "아티스트 미상"} — {q.title || q.slug}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {q.field === "translation" ? "번역" : q.field === "body" ? "전체 본문" : "원문"} · {q.reason}
              </span>
            </button>
          ))}
          {view === "evidence" && !queue.evidence.items.length && (
            <p className="px-3 py-6 text-center text-sm text-muted">모든 교정에 근거가 있습니다.</p>
          )}
          </div>
        </div>
      )}

      {open && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{open.slug}</p>
            <button onClick={() => setOpen(null)} className="text-xs text-muted hover:text-accent">목록으로</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted">현재 가사 (수정 가능)</p>
              <textarea value={open.text} onChange={(e) => setOpen({ ...open, text: e.target.value })}
                rows={18} spellCheck={false}
                className="w-full resize-y  border border-line bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-accent" />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">참고 가사 — 대조용, 저장하지 않음</p>
              <textarea value={ref} onChange={(e) => setRef(e.target.value)} rows={18} spellCheck={false}
                placeholder="공식 가사·앨범 북클릿·공식 영상 자막을 붙여넣고 왼쪽과 비교"
                className="w-full resize-y  border border-line bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-accent" />
            </div>
          </div>

          {open.corrections.length > 0 && (
            <div className=" border border-line p-3">
              <p className="mb-2 text-xs font-semibold">기존 교정 이력과 근거</p>
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {open.corrections.map((item) => (
                  <div key={item.evidenceId} className="border border-line p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={item.evidenceState === "documented" ? "text-emerald-500" : "text-amber-500"}>
                        {item.evidenceState === "documented" ? "근거 완료" : item.evidenceState === "invalid" ? "URL 오류" : "근거 누락"}
                      </span>
                      <span className="text-muted">{item.field === "translation" ? "번역" : item.field === "body" ? "전체 본문" : "원문"} · {item.type} · {item.lineIndex}행</span>
                    </div>
                    <p className="mt-1 leading-relaxed">{item.reason}</p>
                    <p className="mt-1 font-mono text-[10px] text-muted">{item.beforeHash} → {item.afterHash}</p>
                    <div className="mt-2 flex gap-2">
                      <input value={evidenceDrafts[item.evidenceId] || ""}
                        onChange={(e) => setEvidenceDrafts({ ...evidenceDrafts, [item.evidenceId]: e.target.value })}
                        placeholder="https:// 공식 가사·앨범·공식 영상 근거"
                        className="min-w-0 flex-1  border border-line bg-bg px-2 py-1.5 outline-none focus:border-accent" />
                      <button onClick={() => saveEvidence(item)} disabled={busy || !(evidenceDrafts[item.evidenceId] || "").trim()}
                        className="border border-line px-2 py-1.5 font-semibold disabled:opacity-40">
                        근거 저장
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className=" border border-line p-3">
              <p className="mb-2 text-xs text-muted">바뀐 줄 {rows.length}개</p>
              <div className="max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
                {rows.map((r) => (
                  <div key={r.i}>
                    <div className="text-red-400/80">− {r.before || "(없음)"}</div>
                    <div className="text-emerald-400/80">+ {r.after || "(삭제)"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="border border-line bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent">
              {TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="교정 사유 (예: 공식 가사와 대조)"
              className="min-w-[14rem] flex-1  border border-line bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent" />
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="근거 URL (새 교정 필수)"
              className="min-w-[14rem] flex-1  border border-line bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent" />
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} />
              확인 완료로 표시
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={busy}
              className=" ink-action px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">
              {busy ? "저장 중…" : rows.length ? "수정 승인" : "현재 유지"}
            </button>
            <button onClick={() => setOpen({ ...open, text: open.before })} disabled={busy || !rows.length}
              className=" border border-line px-4 py-2 text-sm text-muted disabled:opacity-40">
              되돌리기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
