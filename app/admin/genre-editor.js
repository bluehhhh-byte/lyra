"use client";
import { useState } from "react";
import Link from "next/link";
import { GENRES } from "../../lib/genre";
import AdminErrorMessage from "./error-message";

// 장르 손보기 — 고른 장르 하나가 genre: 필드와 tags 안의 장르 자리에 함께 쓰인다.
// 두 값이 갈라져 화면 문구와 결손 판정이 어긋나던 것이 반복된 사고였다.
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

export default function GenreEditor({ candidates = [] }) {
  const [picks, setPicks] = useState(() =>
    Object.fromEntries(candidates.map((c) => [c.slug, c.suggested || ""]))
  );
  const [done, setDone] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  if (candidates.length === 0)
    return <p className="text-sm text-muted">장르를 손볼 곡이 없습니다 ✓</p>;

  const save = async (slug) => {
    setBusy(slug);
    setError("");
    try {
      const { genre } = await api("genreApply", { slug, genre: picks[slug] });
      setDone((d) => ({ ...d, [slug]: genre }));
    } catch (e) {
      setError(`${slug}: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const pending = candidates.filter((c) => !done[c.slug]);

  // 한 곡씩 차례로 — 저장마다 DB 쓰기와 캐시 무효화가 붙는다
  const saveAll = async () => {
    const targets = pending.filter((c) => picks[c.slug]);
    if (!confirm(`${targets.length}곡의 장르를 고른 값으로 저장합니다. 진행할까요?`)) return;
    for (const c of targets) {
      if (done[c.slug]) continue;
      await save(c.slug);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">{pending.length}곡에 손볼 것이 있습니다.</p>
        <button
          onClick={saveAll}
          disabled={!!busy || pending.length === 0}
          className="ink-action px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
        >
          {busy ? "저장 중…" : `고른 값으로 모두 저장 (${pending.length})`}
        </button>
      </div>

      <ul className="divide-y divide-line border border-line">
        {candidates.map((c) => (
          <li key={c.slug} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <Link
              href={`/admin/edit/${c.slug}`}
              className="min-w-0 flex-1 truncate underline decoration-muted underline-offset-4 hover:text-accent hover:decoration-accent"
            >
              {c.title}
              <span className="text-muted"> — {c.artist}</span>
            </Link>

            {done[c.slug] ? (
              <span className="text-xs text-accent">{done[c.slug]}로 저장됨</span>
            ) : (
              <>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {c.issue ? `태그: ${c.issue}` : `genre ${c.field || "(없음)"} ≠ 태그 ${c.tagGenre}`}
                </span>
                <select
                  value={picks[c.slug] || ""}
                  onChange={(e) => setPicks((p) => ({ ...p, [c.slug]: e.target.value }))}
                  aria-label={`${c.title}의 장르`}
                  className={`min-h-11 w-40 shrink-0 border bg-surface px-2 text-xs outline-none focus:border-accent ${
                    picks[c.slug] ? "border-accent text-ink" : "border-line text-muted"
                  }`}
                >
                  <option value="">장르 고르기…</option>
                  {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <button
                  onClick={() => save(c.slug)}
                  disabled={!!busy || !picks[c.slug]}
                  className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
                >
                  {busy === c.slug ? "…" : "저장"}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-snug text-muted">
        고른 장르가 <code>genre:</code>와 <code>tags</code> 양쪽에 함께 저장됩니다.
        어휘에 없는 값은 서버가 거절하므로 오타로 새 장르가 생기지 않습니다.
      </p>
      <AdminErrorMessage message={error} className="mt-3" />
    </div>
  );
}
