"use client";
import { useEffect, useState } from "react";

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

const LABEL = {
  tags: "태그",
  comment: "코멘트",
  title_ko: "한글 제목",
  artist_ko: "가수 독음",
};

export default function Backfill() {
  const [list, setList] = useState(null);
  const [done, setDone] = useState({}); // slug → filled fields
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const audit = async () => {
    setError("");
    try {
      const { list } = await api("audit");
      setList(list);
      setDone({});
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    audit();
  }, []);

  const fill = async (slug) => {
    setBusy(slug);
    setError("");
    try {
      const { filled } = await api("backfill", { slug });
      setDone((d) => ({ ...d, [slug]: filled }));
    } catch (e) {
      setError(`${slug}: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  // sequential on purpose — parallel Gemini calls trip the free-tier rate limit
  const fillAll = async () => {
    for (const s of list) {
      if (done[s.slug]) continue;
      await fill(s.slug);
    }
  };

  if (list === null) return <p className="text-sm text-muted">확인 중…</p>;

  if (list.length === 0)
    return <p className="text-sm text-muted">누락된 항목이 없습니다 ✓</p>;

  const pending = list.filter((s) => !done[s.slug]).length;

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">{list.length}곡에 빠진 항목이 있습니다.</p>
        <button
          onClick={fillAll}
          disabled={!!busy || pending === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
        >
          {busy ? "채우는 중…" : `전체 자동 채우기 (${pending})`}
        </button>
        <button onClick={audit} disabled={!!busy} className="text-xs text-muted hover:text-accent">
          다시 확인 ↻
        </button>
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line">
        {list.map((s) => (
          <li key={s.slug} className="flex items-center gap-3 px-3 py-2 text-sm">
            <img src={s.artwork} alt="" className="h-9 w-9 shrink-0 rounded" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{s.title}</span>
              <span className="text-muted"> — {s.artist}</span>
              <span className="mt-0.5 flex flex-wrap gap-1">
                {done[s.slug] ? (
                  done[s.slug].length ? (
                    <span className="text-xs text-accent">
                      채움: {done[s.slug].map((f) => LABEL[f] || f).join(", ")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">생성된 값 없음 (Gemini 키 확인)</span>
                  )
                ) : (
                  s.missing.map((f) => (
                    <span key={f} className="rounded-full border border-line px-1.5 text-xs text-muted">
                      {LABEL[f] || f}
                    </span>
                  ))
                )}
              </span>
            </span>
            {!done[s.slug] && (
              <button
                onClick={() => fill(s.slug)}
                disabled={!!busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {busy === s.slug ? "…" : "채우기"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {Object.keys(done).length > 0 && (
        <p className="mt-3 text-xs text-muted">
          온라인 배포본은 재배포 후 반영됩니다. 곡마다 커밋이 하나씩 생깁니다.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
