"use client";

import { useState } from "react";
import Link from "next/link";
import AdminErrorMessage from "../error-message";

export default function PublishCandidateCard({ item }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const complete = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publishComplete", slug: item.slug, title: item.title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "발행 완료 상태를 저장하지 못했습니다.");
      setDone(true);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) return <li role="status" className=" border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{item.title} · 발행 완료</li>;
  return (
    <li className=" border border-line bg-surface p-3 transition hover:border-accent/60">
      <Link href={`/admin/cyno-carousel?movie=${encodeURIComponent(item.slug)}`} className="group grid grid-cols-[64px_minmax(0,1fr)] gap-3">
        <img src={item.poster} alt="" className="aspect-[2/3] w-16  border border-line object-cover" />
        <span className="min-w-0 self-center">
          <span className="block truncate font-semibold group-hover:text-accent">{item.title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">{[item.director, item.rating == null ? "" : `★${item.rating.toFixed(1)}`].filter(Boolean).join(" · ")}</span>
          <span className="mt-2 block text-xs leading-relaxed text-muted">{item.reason}</span>
          <span className="mt-2 block text-xs font-semibold text-accent">이 작품으로 만들기 →</span>
        </span>
      </Link>
      <button type="button" onClick={complete} disabled={busy} className="mt-3 w-full  border border-line px-3 py-2 text-xs font-semibold text-muted hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-50">
        {busy ? "저장 중…" : "발행 완료"}
      </button>
      <AdminErrorMessage message={error} compact className="mt-2 block" />
    </li>
  );
}
