"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const RECENT_KEY = "lyra_recent_searches";

export default function SearchDialog({ open, onClose }) {
  const pathname = usePathname();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"));
    } catch {}
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => onClose(), [pathname]);

  useEffect(() => {
    const needle = query.trim();
    if (!needle) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, { signal: controller.signal });
        const data = await response.json();
        setGroups(data.groups || []);
      } catch {}
      setLoading(false);
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const remember = () => {
    const value = query.trim();
    if (!value) return;
    const next = [value, ...recent.filter((item) => item !== value)].slice(0, 5);
    setRecent(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 p-3 pt-[8vh] sm:p-8 sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="통합 검색"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div className="mx-auto max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-bg shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <span aria-hidden className="text-muted">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="음악·가사·영화·컬렉션·인물 검색"
            className="min-w-0 flex-1 bg-transparent py-4 text-base outline-none"
          />
          <button onClick={onClose} className="text-xs text-muted hover:text-accent">닫기</button>
        </div>
        <div className="max-h-[calc(80vh-58px)] overflow-y-auto p-3">
          {!query && recent.length > 0 && (
            <section>
              <h2 className="px-2 py-2 text-[10px] font-semibold uppercase text-muted">최근 검색</h2>
              <div className="flex flex-wrap gap-2 px-2 pb-3">
                {recent.map((item) => (
                  <button key={item} onClick={() => setQuery(item)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-accent">
                    {item}
                  </button>
                ))}
              </div>
            </section>
          )}
          {loading && <p className="py-12 text-center text-sm text-muted">검색 중…</p>}
          {!loading && query && groups.length === 0 && (
            <p className="py-12 text-center text-sm text-muted">검색 결과가 없습니다.</p>
          )}
          {!loading && groups.map(([label, items]) => (
            <section key={label} className="mb-3">
              <h2 className="px-2 py-2 text-[10px] font-semibold uppercase text-muted">{label}</h2>
              <ul>
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={remember}
                      className="flex items-center gap-3 rounded px-2 py-2 hover:bg-surface"
                    >
                      {item.image ? (
                        <img src={item.image} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-surface text-xs text-muted">
                          {label.slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block truncate text-xs text-muted">{item.subtitle}</span>
                        {item.snippet && <span className="mt-0.5 block truncate text-xs text-muted/70">{item.snippet}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
