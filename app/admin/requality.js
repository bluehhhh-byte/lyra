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

// Report-only: a fuller transcription might exist (romanized iTunes names yield
// partial lyrics). We don't auto-replace — that would clobber the translation.
export default function Requality() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const scan = async () => {
    setBusy(true);
    setError("");
    try {
      const { list } = await api("requality");
      setList(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={scan}
          disabled={busy}
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-accent disabled:opacity-40"
        >
          {busy ? "검사 중… (곡마다 조회, 시간 걸림)" : "가사 품질 재검사"}
        </button>
        <span className="text-xs text-muted">
          더 온전한 전사가 있는 곡을 찾습니다 (부분 가사 탐지)
        </span>
      </div>

      {list && list.length === 0 && (
        <p className="text-sm text-muted">모든 곡이 최선의 전사를 쓰고 있습니다 ✓</p>
      )}

      {list && list.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.map((s) => (
            <li key={s.slug} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1">
                <span className="font-medium">{s.title}</span>
                <span className="text-muted"> — {s.artist}</span>
              </span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                현재 {s.have}줄 → <span className="text-accent">{s.found}줄</span>
              </span>
              <a
                href={`/admin/edit/${s.slug}`}
                className="shrink-0 text-xs text-accent hover:underline"
              >
                수정
              </a>
            </li>
          ))}
        </ul>
      )}

      {list && list.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          자동 교체하지 않습니다 — 번역이 지워지기 때문. 곡을 다시 추가하거나 수정에서 직접 교체하세요.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
