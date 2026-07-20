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
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Finds songs holding a partial transcription (romanized iTunes names yield
// short lyrics) and offers to swap in the fuller one, regenerating the
// translation with it. Checked — and replaced — one song per request so no
// single call hits the serverless timeout.
export default function Requality() {
  const [progress, setProgress] = useState(null); // {done, total}
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState({}); // slug -> "working" | {lines, notesLost} | {err}

  // Replacing discards the current translation and rebuilds it from the fuller
  // lyrics, so it stays an explicit choice rather than something the scan does.
  const replaceOne = async (s) => {
    setState((v) => ({ ...v, [s.slug]: "working" }));
    try {
      const r = await api("requalityApply", { slug: s.slug, lyrics: s.lyrics });
      setState((v) => ({ ...v, [s.slug]: r }));
      return true;
    } catch (e) {
      setState((v) => ({ ...v, [s.slug]: { err: e.message } }));
      return false;
    }
  };

  // sequential — two Gemini calls per song would trip the free-tier rate limit
  // if fired in parallel
  const replaceAll = async () => {
    if (!confirm(`${list.length}곡의 가사를 더 온전한 전사로 교체하고 번역을 다시 생성합니다.\n현재 번역은 사라집니다. 진행할까요?`)) return;
    setBusy(true);
    for (const s of list) {
      if (state[s.slug]?.lines) continue; // already done
      await replaceOne(s);
    }
    setBusy(false);
  };

  const scan = async () => {
    setBusy(true);
    setError("");
    setList(null);
    try {
      const { songs } = await api("requalityList");
      const fuller = [];
      for (let i = 0; i < songs.length; i++) {
        setProgress({ done: i, total: songs.length });
        const s = songs[i];
        try {
          const { have, found, lyrics } = await api("requalityOne", { slug: s.slug });
          if (found) fuller.push({ ...s, have, found, lyrics });
        } catch {
          // skip a song that errors (rate limit / network) — re-scan catches it
        }
      }
      setProgress({ done: songs.length, total: songs.length });
      setList(fuller);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* min-w + tabular-nums: the progress counter is wider than the idle
          label and would otherwise shove the hint text sideways mid-scan */}
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={scan}
          disabled={busy}
          className="min-w-32 rounded-lg border border-line px-4 py-2 text-center text-sm leading-tight tabular-nums text-muted hover:text-accent disabled:opacity-40"
        >
          {/* two lines in both states so the button keeps its size while scanning */}
          가사 품질
          <br />
          {busy
            ? `검사 중… ${progress ? `${progress.done}/${progress.total}` : ""}`
            : "재검사"}
        </button>
        <span className="text-xs text-muted">
          더 온전한 전사가 있는 곡을 찾습니다 (부분 가사 탐지)
        </span>
      </div>

      {list && list.length === 0 && (
        <p className="text-sm text-muted">모든 곡이 최선의 전사를 쓰고 있습니다 ✓</p>
      )}

      {list && list.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-3">
            <button
              onClick={replaceAll}
              disabled={busy}
              className="rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent hover:text-bg disabled:opacity-40"
            >
              전체 교체 ({list.length}곡)
            </button>
            <span className="text-xs text-muted">번역을 다시 생성합니다</span>
          </div>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {list.map((s) => {
              const st = state[s.slug];
              return (
                <li key={s.slug} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{s.title}</span>
                    <span className="text-muted"> — {s.artist}</span>
                  </span>
                  {st?.lines ? (
                    <span className="shrink-0 text-xs text-green-400 tabular-nums">
                      ✓ {st.lines}줄로 교체
                      {st.notesKept ? ` · 노트 ${st.notesKept}개 이관` : ""}
                      {st.notesLost ? ` · 노트 ${st.notesLost}개 이관 실패` : ""}
                    </span>
                  ) : (
                    <>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        현재 {s.have}줄 → <span className="text-accent">{s.found}줄</span>
                      </span>
                      <button
                        onClick={() => replaceOne(s)}
                        disabled={busy || st === "working"}
                        className="shrink-0 rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-40"
                      >
                        {st === "working" ? "교체 중…" : "교체"}
                      </button>
                      <a
                        href={`/admin/edit/${s.slug}`}
                        className="shrink-0 text-xs text-accent hover:underline"
                      >
                        수정
                      </a>
                    </>
                  )}
                  {st?.err && (
                    <span className="shrink-0 text-xs text-red-400 dark:text-red-400">{st.err}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">
            교체하면 더 온전한 전사로 바꾸고 번역을 다시 생성합니다 — 현재 번역은 사라지고,
            손으로 쓴 연 해설은 원문 줄을 따라 옮겨집니다. 되돌리려면 git 커밋 기록을 사용하세요.
          </p>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
