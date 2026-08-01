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

const LABEL = {
  update: "갱신 예정", updated: "갱신됨",
  create: "신규 예정", created: "등록됨",
  nochange: "변경 없음", skip: "미등록 작품", nomatch: "TMDB 못 찾음", error: "오류",
};
const TONE = {
  updated: "text-green-400", created: "text-green-400",
  update: "text-accent", create: "text-accent",
  nochange: "text-muted", skip: "text-muted/60",
  nomatch: "text-yellow-400", error: "text-red-400 dark:text-red-400",
};

// 왓챠피디아에서 뽑은 JSON을 붙여넣어 별점·코멘트를 반영한다.
// 서버가 한 건씩 처리하므로(TMDB 호출 때문) 여기서 순차로 돌린다.
export default function WatchaImport() {
  const [raw, setRaw] = useState("");
  const [create, setCreate] = useState(false);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const parse = () => {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) throw new Error("JSON 배열이 아닙니다");
    return items.filter((i) => i?.title);
  };

  const run = async (apply) => {
    setError("");
    let items;
    try {
      items = parse();
    } catch (e) {
      setError(`JSON을 읽을 수 없습니다 — ${e.message}`);
      return;
    }
    if (!items.length) return setError("항목이 없습니다");
    if (apply && !confirm(`${items.length}건을 반영합니다.${create ? "\n미등록 작품은 TMDB에서 찾아 새로 등록됩니다." : ""}\n계속할까요?`)) return;

    setBusy(apply ? "적용" : "미리보기");
    const out = [];
    for (let i = 0; i < items.length; i++) {
      setRows([...out, { title: items[i].title, action: "…", _n: `${i + 1}/${items.length}` }]);
      try {
        const r = await api("watchaImport", { item: items[i], apply, create });
        out.push({ ...r, title: r.title || items[i].title });
      } catch (e) {
        out.push({ action: "error", title: items[i].title, error: e.message });
      }
    }
    setRows(out);
    setBusy("");
  };

  const count = (a) => (rows || []).filter((r) => r.action === a).length;
  const shown = (rows || []).filter((r) => r.action !== "skip"); // 미등록은 접어둔다

  return (
    <div className="max-w-2xl">
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={5}
        placeholder='왓챠에서 받은 JSON을 붙여넣으세요 — [{"title":"룩백","year":2024,"rating":4.5}, …]'
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          onClick={() => run(false)}
          disabled={!!busy || !raw.trim()}
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-accent disabled:opacity-40"
        >
          {busy === "미리보기" ? "확인 중…" : "미리보기"}
        </button>
        <button
          onClick={() => run(true)}
          disabled={!!busy || !raw.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
        >
          {busy === "적용" ? "반영 중…" : "반영"}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />
          미등록 작품도 새로 등록
        </label>
      </div>
      <p className="mt-2 text-xs text-muted/70">
        체크를 끄면 이미 등록된 작품의 별점·코멘트만 채웁니다 — 평가 목록 전체(수천 건)를
        붙여넣어도 안전합니다.
      </p>

      {error && <p className="mt-3 text-sm text-red-400 dark:text-red-400">{error}</p>}

      {rows && (
        <>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {["updated", "created", "update", "create", "nochange", "nomatch", "error"].map(
              (k) => count(k) > 0 && (
                <span key={k} className={TONE[k]}>
                  {LABEL[k]} {count(k)}
                </span>
              )
            )}
            {count("skip") > 0 && <span className="text-muted/60">미등록 {count("skip")}건 건너뜀</span>}
          </div>
          {shown.length > 0 && (
            <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {shown.map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  {r.matched && <span className="shrink-0 text-xs text-muted">→ {r.matched}</span>}
                  {r.changed && <span className="shrink-0 text-xs text-muted">{r.changed.join(", ")}</span>}
                  <span className={`shrink-0 text-xs ${TONE[r.action] || "text-muted"}`}>
                    {r.error || LABEL[r.action] || r.action}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
