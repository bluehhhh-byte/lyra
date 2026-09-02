"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import CoverImage from "./cover-image";
import { highlightSegments } from "../lib/search-highlight";
import { readRecentSearches, rememberRecentSearch } from "../lib/search-history";

function Highlight({ value, query }) {
  return highlightSegments(value, query).map((part, index) =>
    part.match ? <mark key={index} className="bg-transparent font-semibold text-accent">{part.text}</mark> : part.text
  );
}

export default function SearchDialog({ open, onClose }) {
  const pathname = usePathname();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecentSearches(localStorage));
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
    const next = rememberRecentSearch(localStorage, recent, value);
    setRecent(next);
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
      <div className="mx-auto max-h-[80vh] w-full max-w-2xl overflow-hidden  border border-line bg-bg shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <span aria-hidden className="text-muted">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="음악·가사·영화·인물 검색"
            className="min-w-0 flex-1 bg-transparent py-4 text-base outline-none"
          />
          <button onClick={onClose} className="min-h-11 px-2 text-xs text-muted hover:text-accent">닫기</button>
        </div>
        <div className="max-h-[calc(80vh-58px)] overflow-y-auto p-3">
          {!query && recent.length > 0 && (
            <section>
              <h2 className="px-2 py-2 text-[10px] font-semibold uppercase text-muted">최근 검색</h2>
              <div className="flex flex-wrap gap-2 px-2 pb-3">
                {recent.map((item) => (
                  <button key={item} onClick={() => setQuery(item)} className="min-h-11  border border-line px-3 py-1 text-xs text-muted hover:text-accent">
                    {item}
                  </button>
                ))}
              </div>
            </section>
          )}
          {loading && <p className="py-12 text-center text-sm text-muted">검색 중…</p>}
          {!loading && query && groups.length === 0 && (
            <div className="py-12 text-center text-sm text-muted">
              <p>검색 결과가 없습니다.</p>
              <p className="mt-1 text-xs">검색어를 줄이거나 띄어쓰기를 바꿔 보세요.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button onClick={() => setQuery("")} className="min-h-11  border border-line px-3 py-1.5 text-xs hover:text-accent">검색어 지우기</button>
                <Link href={`/?q=${encodeURIComponent(query.trim())}`} onClick={remember} className="flex min-h-11 items-center  border border-line px-3 py-1.5 text-xs hover:text-accent">전체 곡에서 찾아보기</Link>
              </div>
            </div>
          )}
          {!loading && groups.map(([label, items]) => (
            <section key={label} className="mb-3">
              <h2 className="px-2 py-2 text-[10px] font-semibold uppercase text-muted">{label}</h2>
              <ul>
                {items.map((item) => {
                  const external = item.href?.startsWith("http");
                  const inner = (
                    <>
                      {item.image ? (
                        <CoverImage src={item.image} alt="" label={label.slice(0, 1)} className="h-11 w-11 shrink-0  object-cover" />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center  bg-surface text-xs text-muted">
                          {label.slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium"><Highlight value={item.title} query={query} /></span>
                        <span className="block truncate text-xs text-muted"><Highlight value={item.subtitle} query={query} /></span>
                        {item.snippet && <span className="mt-0.5 block truncate text-xs text-muted"><Highlight value={item.snippet} query={query} /></span>}
                      </span>
                    </>
                  );
                  const cls = "flex items-center gap-3  px-2 py-2 hover:bg-surface";
                  return (
                    <li key={item.href}>
                      {external ? (
                        <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={remember} className={cls}>
                          {inner}
                        </a>
                      ) : (
                        <Link href={item.href} onClick={remember} className={cls}>{inner}</Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
