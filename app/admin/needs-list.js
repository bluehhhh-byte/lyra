"use client";
import { useState } from "react";
import Link from "next/link";
import AdminErrorMessage from "./error-message";

// backfill 액션이 실제로 채우는 것은 tags·comment·title_ko·artist_ko 네 가지뿐이다.
// 나머지 결손(번역·독음·키워드·감정·커버…)은 곡마다 판단이 필요해 편집 화면으로 보낸다.
// 채우지도 못하면서 버튼만 있는 편이 아무것도 없는 것보다 나쁘다 — 실제로 채울 수
// 있는 줄에만 버튼을 띄운다.
const FILLABLE = ["코멘트 없음", "한글 제목 없음"];
const canFill = (item) => item.kind === "song" && item.needs.some((need) => FILLABLE.includes(need));

const FILLED_LABEL = { tags: "태그", comment: "코멘트", title_ko: "한글 제목", artist_ko: "가수 독음" };

export default function NeedsList({ items, truncated = 0 }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState({});
  const [error, setError] = useState("");

  if (!items.length) return null;

  const fill = async (slug) => {
    setBusy(slug);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backfill", slug }),
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDone((d) => ({ ...d, [slug]: data.filled || [] }));
    } catch (e) {
      setError(`${slug}: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mt-3  border border-line bg-surface px-4 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold hover:text-accent"
      >
        <span>결손 항목 {items.length}건{truncated > 0 && ` (외 ${truncated}건)`}</span>
        <span aria-hidden="true" className="text-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          <ul className="mt-2 divide-y divide-line text-xs">
            {items.map((item) => {
              const filled = done[item.slug];
              return (
                <li key={`${item.kind}:${item.slug}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2">
                  <span className="border border-line px-1.5 py-0.5 text-[10px] text-muted">
                    {item.kind === "movie" ? "영화" : "곡"}
                  </span>
                  <Link
                    href={item.kind === "movie" ? "/admin/movie" : `/admin/edit/${item.slug}`}
                    className="min-w-0 flex-1 truncate underline decoration-muted underline-offset-4 hover:text-accent hover:decoration-accent"
                  >
                    {item.title}
                    {item.subtitle && <span className="text-muted"> — {item.subtitle}</span>}
                  </Link>
                  {filled ? (
                    <span className="text-accent">
                      {filled.length
                        ? `채움: ${filled.map((f) => FILLED_LABEL[f] || f).join(", ")}`
                        : "생성된 값 없음 (Gemini 키·쿼터 확인)"}
                    </span>
                  ) : (
                    <>
                      <span className="flex flex-wrap gap-1">
                        {item.needs.map((need) => (
                          <span key={need} className="border border-line px-1.5 text-[10px] text-muted">{need}</span>
                        ))}
                      </span>
                      {canFill(item) && (
                        <button
                          onClick={() => fill(item.slug)}
                          disabled={!!busy}
                          className="shrink-0 text-accent hover:underline disabled:opacity-40"
                        >
                          {busy === item.slug ? "…" : "채우기"}
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            ‘채우기’는 코멘트·한글 제목처럼 자동 생성이 가능한 항목만 채운다.
            번역·독음·키워드·감정·커버는 곡마다 판단이 필요하므로 제목을 눌러 편집 화면에서 처리한다.
          </p>
          <AdminErrorMessage message={error} className="mt-2" />
        </>
      )}
    </div>
  );
}
