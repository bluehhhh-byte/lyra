"use client";
import { useState } from "react";
import AdminErrorMessage from "./error-message";

// 가사 구간 편집 — 곡을 고르고, 구간이 시작되는 줄에 이름을 붙이고, 저장한다.
// 서버가 원문 줄을 대조해 하나라도 어긋나면 거절하므로, 여기서 잘못 눌러도
// 가사가 상하지는 않는다.
const LABELS = ["Intro", "Verse 1", "Verse 2", "Verse 3", "Pre-Chorus", "Chorus", "Post-Chorus", "Bridge", "Hook", "Interlude", "Outro"];

async function api(action, payload) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function SectionEditor({ candidates = [] }) {
  const [slug, setSlug] = useState("");
  const [lines, setLines] = useState(null);
  const [marks, setMarks] = useState({}); // at → label
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = async (next) => {
    setSlug(next);
    setLines(null);
    setMarks({});
    setSaved("");
    setError("");
    if (!next) return;
    setBusy("불러오는 중…");
    try {
      const { lines } = await api("sectionPlan", { slug: next });
      setLines(lines);
      // 이미 붙어 있는 구간은 그대로 살려 둔다 — 처음부터 다시 찍게 하지 않는다.
      setMarks(Object.fromEntries(lines.filter((l) => l.section).map((l) => [l.at, l.section])));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    setBusy("저장 중…");
    setError("");
    try {
      const payload = Object.entries(marks).map(([at, section]) => ({ at: Number(at), section }));
      const { sections, changed } = await api("sectionApply", { slug, marks: payload });
      setSaved(changed ? `구간 ${sections}개 저장됨` : "바뀐 것이 없습니다");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const setMark = (at, label) =>
    setMarks((prev) => {
      const next = { ...prev };
      if (label) next[at] = label;
      else delete next[at];
      return next;
    });

  const count = Object.values(marks).filter(Boolean).length;

  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={slug}
          onChange={(e) => load(e.target.value)}
          aria-label="구간을 넣을 곡"
          className="min-w-0 flex-1 border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">구간이 필요한 곡 {candidates.length}곡 중에서 고르기…</option>
          {candidates.map((c) => (
            <option key={c.slug} value={c.slug}>{c.title} — {c.artist}</option>
          ))}
        </select>
        {lines && (
          <button
            onClick={save}
            disabled={!!busy}
            className="ink-action shrink-0 px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
          >
            {busy || `구간 ${count}개 저장`}
          </button>
        )}
      </div>

      {candidates.length === 0 && <p className="text-sm text-muted">구간이 필요한 곡이 없습니다 ✓</p>}

      {lines && (
        <>
          <p className="mb-2 text-xs text-muted">
            구간이 시작되는 줄에 이름을 고르세요. 원문·번역·독음은 저장 시 서버가 대조해 지키므로 바뀌지 않습니다.
          </p>
          <ol className="divide-y divide-line border border-line">
            {lines.map((line) => (
              <li key={line.at} className="flex items-center gap-2 px-2 py-1.5">
                <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted tabular-nums">{line.at}</span>
                <select
                  value={marks[line.at] || ""}
                  onChange={(e) => setMark(line.at, e.target.value)}
                  aria-label={`${line.at}번째 줄의 구간`}
                  className={`min-h-11 w-32 shrink-0 border bg-surface px-1.5 text-xs outline-none focus:border-accent ${
                    marks[line.at] ? "border-accent text-ink" : "border-line text-muted"
                  }`}
                >
                  <option value="">—</option>
                  {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <span className="min-w-0 flex-1 truncate text-sm">{line.text}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {saved && <p className="mt-3 text-sm text-accent">{saved}</p>}
      <AdminErrorMessage message={error} className="mt-3" />
    </div>
  );
}
