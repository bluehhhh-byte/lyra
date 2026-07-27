"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./theme-toggle";
import SearchDialog from "./search-dialog";

const PRIMARY = [
  ["/archive", "아카이브"],
  ["/", "음악"],
  ["/movies", "영화"],
  ["/diary", "일기"],
];

const MORE = [
  ["/collections", "컬렉션"],
  ["/watchlist", "워치리스트"],
  ["/people", "인물"],
  ["/recap", "결산"],
  ["/stats", "통계"],
  ["/tags", "태그"],
  ["/admin", "관리자"],
];

export default function Header() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inMovies =
    pathname?.startsWith("/movies") ||
    pathname?.startsWith("/collections") ||
    pathname?.startsWith("/watchlist") ||
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
        <Link href={inMovies ? "/movies" : "/"} className="shrink-0 text-lg font-bold">
          {inMovies ? "Syno" : "Lyra"}<span className="text-accent">.</span>
        </Link>

        <nav className="hidden items-center gap-5 text-xs text-muted md:flex">
          {PRIMARY.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? "text-ink" : "hover:text-accent"}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-xs text-muted">
          <button onClick={() => setSearchOpen(true)} className="hover:text-accent" aria-label="통합 검색">
            검색
          </button>
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-label="전체 메뉴"
            className="h-8 w-8 text-lg hover:text-accent"
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
              {MORE.map(([href, label]) => (
                <Link key={href} href={href} className="flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-surface hover:text-accent">
                  {label}<span className="text-muted">→</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
