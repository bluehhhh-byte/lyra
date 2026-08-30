"use client";
import { useState } from "react";
import AdminErrorMessage from "./error-message";

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

// 커버 수동 검토 — 자동 백필(iTunes·Deezer·CAA)이 못 찾았거나 모호했던 곡.
// 검색 첫 결과를 자동 선택하지 않는다: 사람이 URL을 확인하고 붙인다.
export default function ArtworkReview({ items }) {
  const [state, setState] = useState({}); // slug → { url, msg, done }
  const set = (slug, patch) => setState((s) => ({ ...s, [slug]: { ...s[slug], ...patch } }));

  const save = async (slug, none) => {
    const url = state[slug]?.url || "";
    set(slug, { msg: "저장 중…", error: "" });
    try {
      await api("setArtwork", none ? { slug, none: true } : { slug, artwork: url });
      set(slug, { msg: none ? "커버 없음 확정" : "저장 완료", error: "", done: true });
    } catch (e) {
      set(slug, { msg: "", error: e.message });
    }
  };

  if (!items.length) return <p className="text-sm text-muted">커버 검토가 필요한 곡이 없습니다.</p>;

  return (
    <div className="max-w-3xl">
      <p className="mb-3 text-xs text-muted">
        {items.length}곡 — iTunes·Deezer·Cover Art Archive에서 검증된 커버를 찾지 못했다. 직접 URL을
        붙이거나 커버 없음으로 확정 (확정 시 검사에서 제외).
      </p>
      <ul className="divide-y divide-line  border border-line">
        {items.map((s) => {
          const st = state[s.slug] || {};
          return (
            <li key={s.slug} className={`px-3 py-2 text-sm ${st.done ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {s.title} <span className="text-muted">· {s.artist}{s.year ? ` · ${s.year}` : ""}</span>
                  {s.status && <span className="ml-2  bg-surface px-1.5 py-0.5 text-[10px] text-muted">{s.status}</span>}
                </span>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${s.artist} ${s.title} album cover`)}&tbm=isch`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-muted hover:text-accent"
                >
                  검색 ↗
                </a>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <input
                  value={st.url || ""}
                  onChange={(e) => set(s.slug, { url: e.target.value })}
                  placeholder="https:// 커버 이미지 URL"
                  className="min-w-56 flex-1  border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
                />
                <button
                  onClick={() => save(s.slug)}
                  disabled={!st.url || st.done}
                  className="border border-accent px-2.5 py-1 text-xs text-accent hover:bg-accent hover:text-bg disabled:opacity-40"
                >
                  저장
                </button>
                <button
                  onClick={() => save(s.slug, true)}
                  disabled={st.done}
                  className="border border-line px-2.5 py-1 text-xs text-muted hover:text-accent disabled:opacity-40"
                >
                  커버 없음 확정
                </button>
                {st.msg && <span className="text-xs text-muted">{st.msg}</span>}
                <AdminErrorMessage message={st.error} compact />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
