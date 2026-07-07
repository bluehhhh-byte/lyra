"use client";
import { useEffect, useState } from "react";

async function api(action, body) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function EditForm({ slug }) {
  const [raw, setRaw] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    api("load", { slug })
      .then((d) => setRaw(d.raw))
      .catch((e) => setStatus(e.message));
  }, [slug]);

  const save = async () => {
    setStatus("저장 중…");
    try {
      await api("update", { slug, raw });
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
          className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-400 hover:bg-red-400/10"
        >
          삭제
        </button>
        <span className="text-sm text-muted">{status}</span>
      </div>
    </div>
  );
}
