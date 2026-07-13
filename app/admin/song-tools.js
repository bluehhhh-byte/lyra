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

// Per-song maintenance: regenerate the comment (음슴체), or add a translation to a
// song that has none (used to give Korean songs the bilingual two-line layout).
export default function SongTools({ songs }) {
  const [state, setState] = useState({}); // slug -> { busy, comment, msg, err }
  const [bulk, setBulk] = useState(null); // {done, total} while regenerating all

  const set = (slug, patch) => setState((s) => ({ ...s, [slug]: { ...s[slug], ...patch } }));

  const regenMeta = async (slug) => {
    set(slug, { busy: "meta", err: "", msg: "" });
    try {
      const { updated } = await api("regenMeta", { slug });
      set(slug, { msg: updated?.length ? `갱신: ${updated.join(", ")}` : "변경 없음" });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  // one song per request (timeout-safe), sequential to respect the Gemini rate limit
  const regenAll = async () => {
    for (let i = 0; i < songs.length; i++) {
      setBulk({ done: i, total: songs.length });
      await regenMeta(songs[i].slug);
    }
    setBulk({ done: songs.length, total: songs.length });
    setTimeout(() => setBulk(null), 4000);
  };

  const regen = async (slug) => {
    set(slug, { busy: "comment", err: "", msg: "" });
    try {
      const { comment } = await api("regenComment", { slug });
      set(slug, { comment });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  const restanza = async (slug) => {
    set(slug, { busy: "stanza", err: "", msg: "" });
    try {
      const { stanzas } = await api("restanza", { slug });
      set(slug, { msg: `연 ${stanzas}개로 재구성 (재배포 후 반영)` });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  const addTrans = async (slug) => {
    set(slug, { busy: "trans", err: "", msg: "" });
    try {
      await api("addTranslation", { slug });
      set(slug, { msg: "번역 추가됨 (재배포 후 반영)" });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={regenAll}
          disabled={!!bulk}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
        >
          {bulk ? `전체 메타 재생성 중… ${bulk.done}/${bulk.total}` : "전체 메타 AI 재생성"}
        </button>
        <span className="text-xs text-muted">
          태그·코멘트·한글제목·독음을 곡마다 새로 생성(덮어씀)
        </span>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
      {songs.map((s) => {
        const st = state[s.slug] || {};
        return (
          <li key={s.slug} className="px-3 py-2 text-sm">
            <div className="flex items-center gap-3">
              <img src={s.artwork} alt="" className="h-9 w-9 shrink-0 rounded" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{s.title}</span>
                <span className="text-muted"> — {s.artist}</span>
              </span>
              <button
                onClick={() => regenMeta(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "meta" ? "생성 중…" : "메타 재생성"}
              </button>
              <button
                onClick={() => regen(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "comment" ? "생성 중…" : "코멘트"}
              </button>
              <button
                onClick={() => restanza(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "stanza" ? "정리 중…" : "연 정리"}
              </button>
              {!s.hasTranslation && (
                <button
                  onClick={() => addTrans(s.slug)}
                  disabled={!!st.busy}
                  className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
                >
                  {st.busy === "trans" ? "번역 중…" : "번역 추가"}
                </button>
              )}
              <a href={`/admin/edit/${s.slug}`} className="shrink-0 text-xs text-muted hover:text-accent">
                수정
              </a>
            </div>
            <p className="mt-1 pl-12 text-xs text-muted">
              {st.err ? (
                <span className="text-red-400">{st.err}</span>
              ) : st.msg ? (
                <span className="text-accent">{st.msg}</span>
              ) : (
                st.comment ?? s.comment ?? "(코멘트 없음)"
              )}
            </p>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
