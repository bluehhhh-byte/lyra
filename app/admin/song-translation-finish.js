"use client";
import { useState } from "react";
import AdminErrorMessage from "./error-message";

// 이 곡의 영어 번역을 마저 채운다.
//
// Effie <MAKGEOLLI BANGER>는 41줄 중 39줄이 영어인데 두 줄만 번역 칸에 한국어가
// 들어 있었다 — 한국어 줄을 한국어로 고쳐 쓴 것이라 번역이 아니다. 목록에서는
// "영어 번역 없음 2줄"로만 보이고, 관리 도구의 일괄 채우기는 덮어쓰기를 하지
// 않으므로 그 두 줄을 건너뛴다. 그래서 곡이 영영 "덜 된" 채로 남는다.
//
// 여기서는 덮어쓴다. 대신 무엇이 바뀌는지 먼저 보여 주고, 사람이 누른 뒤에만 쓴다.
async function api(action, body) {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export default function SongTranslationFinish({ slug, onSaved }) {
  const [changes, setChanges] = useState(null);
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const run = async (name, work) => {
    setBusy(name);
    setError("");
    try { await work(); } catch (reason) { setError(reason.message); } finally { setBusy(""); }
  };

  const look = () => run("preview", async () => {
    setDone("");
    const data = await api("enTranslate", { slug, replace: true, preview: true });
    setChanges(data.changes || []);
  });

  const apply = () => run("apply", async () => {
    const data = await api("enTranslate", { slug, replace: true });
    const parts = [data.filled && `${data.filled}줄 채움`, data.replaced && `${data.replaced}줄 교체`].filter(Boolean);
    setDone(parts.length ? parts.join(" · ") : "바뀐 줄 없음");
    setChanges(null);
    onSaved?.();
  });

  const button = "border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-50";

  return (
    <section className="border-t border-line pt-5">
      <h2 className="text-sm font-semibold text-ink">영어 번역 마저 채우기</h2>
      <p className="mt-1 text-xs text-muted">
        한국어 줄에 영어 번역이 없거나, 번역 칸에 한국어가 들어 있는 줄을 찾아 AI로 채웁니다.
        원문 가사와 frontmatter는 건드리지 않습니다. 덮어쓰기가 있으므로 먼저 무엇이 바뀌는지 보여 줍니다.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={button} onClick={look} disabled={Boolean(busy)}>
          {busy === "preview" ? "찾는 중…" : "무엇이 바뀌는지 보기"}
        </button>
        {changes?.length > 0 && (
          <button type="button" className={button} onClick={apply} disabled={Boolean(busy)}>
            {busy === "apply" ? "저장 중…" : `${changes.length}줄 반영하기`}
          </button>
        )}
      </div>

      {changes?.length === 0 && <p className="mt-2 text-sm text-muted">채우거나 바꿀 줄이 없습니다 ✓</p>}

      {changes?.length > 0 && (
        <ul className="mt-3 divide-y divide-line border border-line text-sm">
          {changes.map((change, index) => (
            <li key={`${change.original}-${index}`} className="px-3 py-2">
              <p className="text-xs text-muted">{change.original}</p>
              {change.before && (
                <p className="mt-0.5 text-xs text-red-600 line-through dark:text-red-400">{change.before}</p>
              )}
              <p className="mt-0.5">{change.after}</p>
              <p className="mt-0.5 text-[11px] text-muted">{change.kind === "replace" ? "덮어씀 — 번역 칸에 한국어가 있었다" : "빈 칸을 채움"}</p>
            </li>
          ))}
        </ul>
      )}

      {done && <p className="mt-2 text-sm" role="status">{done}</p>}
      <AdminErrorMessage message={error} className="mt-3" />
    </section>
  );
}
