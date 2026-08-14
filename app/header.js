"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./theme-toggle";
import SearchDialog from "./search-dialog";

const PRIMARY = [
  ["/", "음악"],
  ["/movies", "영화"],
  ["/archive", "아카이브"],
];

// 전체 메뉴 — 작은 라벨로 세계를 구분한다 (아카이브·일기는 상단 내비 담당)
const MORE = [
  ["LYRA", [
    ["/songs/taste", "음악 취향"],
    ["/songs/motifs", "가사 모티프"],
    ["/recommendations/music", "추천 곡"],
  ]],
  ["SYNO", [
    ["/watched", "평가한 영화"],
    ["/watched/taste", "영화 취향"],
    ["/recommendations", "추천 영화"],
    ["/people", "인물"],
  ]],
  ["기록", [
    ["/recap", "결산"],
    ["/stats", "통계"],
    ["/diary", "감정으로 보기"],
    ["/tags", "태그"],
  ]],
];

export default function Header() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inMovies =
    pathname?.startsWith("/movies") ||
    (pathname?.startsWith("/recommendations") && !pathname?.startsWith("/recommendations/music")) ||
    pathname?.startsWith("/watched") ||
    pathname?.startsWith("/people") ||
    pathname?.startsWith("/admin/movie");

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const shortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    addEventListener("keydown", shortcut);
    return () => removeEventListener("keydown", shortcut);
  }, []);

  return (
    <>
      <header className="relative z-30 mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-6">
        {/* 로고는 두 세계의 스위치 — Lyra.를 누르면 Syno.(영화)로, Syno.를
            누르면 Lyra.(음악)로 넘어간다. 현재 섹션 홈은 내비의 음악/영화가 담당. */}
        <Link
          href={inMovies ? "/" : "/movies"}
          title={inMovies ? "Lyra. — 음악으로" : "Syno. — 영화로"}
          className="shrink-0 text-lg font-bold"
        >
          {inMovies ? "Syno" : "Lyra"}<span className="text-accent">.</span>
        </Link>

        <nav className="hidden items-center gap-5 text-xs text-muted md:flex">
          {PRIMARY.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? "text-ink" : "hover:text-accent"}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 text-xs text-muted">
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="통합 검색"
            className="flex h-8 items-center gap-1.5 rounded-full border border-line px-3 hover:border-accent hover:text-accent"
          >
            <span aria-hidden>⌕</span>
            <span className="hidden sm:inline">검색</span>
            {/* 단축키는 header의 keydown 리스너가 처리한다 — 여긴 힌트만 */}
            <kbd className="hidden font-sans text-[10px] text-muted/70 md:inline">⌘K</kbd>
          </button>
          <ThemeToggle />
          <Link
            href="/admin"
            aria-label="관리자"
            title="관리자"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface hover:text-accent"
          >
            ⚙
          </Link>
          <button
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-label="전체 메뉴"
            className={`h-8 w-8 rounded-md text-lg hover:bg-surface hover:text-accent ${menuOpen ? "bg-surface text-ink" : ""}`}
          >
            {menuOpen ? "×" : "☰"}
          </button>
        </div>

        {menuOpen && (
          <div className="absolute right-5 top-16 w-52 rounded-lg border border-line bg-bg p-2 shadow-2xl">
            <div className="border-b border-line pb-2 md:hidden">
              {PRIMARY.map(([href, label]) => (
                <Link key={href} href={href} className="block rounded px-3 py-2 text-sm hover:bg-surface hover:text-accent">
                  {label}
                </Link>
              ))}
            </div>
            <div className="pt-2">
              {MORE.map(([groupLabel, links]) => (
                <div key={groupLabel} className="mb-1">
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted/60">
                    {groupLabel}
                  </p>
                  {links.map(([href, label]) => (
                    <Link key={href} href={href} className="flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-surface hover:text-accent">
                      {label}<span className="text-muted">→</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </header>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
