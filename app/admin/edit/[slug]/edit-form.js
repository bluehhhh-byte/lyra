"use client";
import { useEffect, useRef, useState } from "react";
import { clearSongDraft, readSongDraft, writeSongDraft } from "../../../../lib/admin/draft";

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
    data = { error: text.slice(0, 200) }; // HTML error page etc.
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function EditForm({ slug }) {
  const [raw, setRaw] = useState(null);
  const [translationVariants, setTranslationVariants] = useState([]);
  const [status, setStatus] = useState("");
  const savedRaw = useRef(null);

  useEffect(() => {
    const draft = readSongDraft(window.localStorage, slug);
    api("load", { slug })
      .then((d) => {
        savedRaw.current = d.raw;
        if (draft?.raw && draft.raw !== d.raw) {
          setRaw(draft.raw);
          setStatus("저장하지 않은 로컬 초안을 복원했습니다");
        } else {
          clearSongDraft(window.localStorage, slug);
          setRaw(d.raw);
        }
        setTranslationVariants(d.translationVariants || []);
      })
      .catch((e) => {
        if (draft?.raw) {
          setRaw(draft.raw);
          setStatus(`${e.message} · 로컬 초안을 복원했습니다`);
        } else {
          setStatus(e.message);
        }
      });
  }, [slug]);

  useEffect(() => {
    if (raw === null) return;
    const timer = setTimeout(() => {
      if (raw === savedRaw.current) clearSongDraft(window.localStorage, slug);
      else writeSongDraft(window.localStorage, slug, raw);
    }, 250);
    return () => clearTimeout(timer);
  }, [raw, slug]);

  const save = async () => {
    setStatus("저장 중…");
    try {
      const result = await api("update", { slug, raw });
      savedRaw.current = raw;
      clearSongDraft(window.localStorage, slug);
      setTranslationVariants(result.translationVariants || []);
      setStatus("저장됨 ✓");
    } catch (e) {
      setStatus(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`"${slug}" 곡을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api("delete", { slug });
      location.href = "/admin";
    } catch (e) {
      setStatus(e.message);
    }
  };

  if (raw === null) return <p className="text-sm text-muted">{status || "불러오는 중…"}</p>;

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">곡 수정</h1>
        <a href={`/songs/${slug}`} className="text-sm text-accent underline">
          페이지 보기 →
        </a>
      </div>
      <p className="mb-3 text-xs text-muted">
        frontmatter(제목·태그·코멘트)와 가사를 직접 수정.{" "}
        <code>&gt; 번역</code> · <code>+ 독음</code> · <code>// 해설</code> · 빈 줄 = 연 구분
      </p>
      <TranslationVariantNotice items={translationVariants} />
      <textarea
        className="h-[32rem] w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg"
        >
          저장
        </button>
        <button
          onClick={remove}
          className="rounded-lg border border-red-600/40 px-4 py-2 text-sm text-red-600 hover:bg-red-600/10 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-400/10"
        >
          삭제
        </button>
        <span className="text-sm text-muted">{status}</span>
      </div>
    </div>
  );
}

function TranslationVariantNotice({ items }) {
  if (!items.length) return null;
  return (
    <aside data-testid="translation-variant-notice" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <h2 className="text-sm font-semibold text-ink">반복 구절의 번역이 다릅니다</h2>
      <p className="mt-1 text-xs text-muted">문맥에 따른 차이일 수 있습니다. 원문과 번역을 보고 직접 판단해 주세요.</p>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item.original}>
            <p className="font-serif text-sm text-ink">{item.original}</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {item.translations.map((translation) => <li key={translation}>→ {translation}</li>)}
            </ul>
          </li>
        ))}
      </ul>
    </aside>
  );
}
