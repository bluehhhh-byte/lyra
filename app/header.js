"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./theme-toggle";

export default function Header() {
  const pathname = usePathname();
  const inMovies = pathname?.startsWith("/movies") || pathname?.startsWith("/admin/movie");
  const brand = inMovies ? "Syno" : "Lyra";

  return (
    <header className="mx-auto flex max-w-5xl items-baseline justify-between px-5 py-8">
      <Link href={inMovies ? "/movies" : "/"} className="text-lg font-bold tracking-tight">
        {brand}<span className="text-accent">.</span>
      </Link>
      <nav className="flex items-baseline gap-4 text-xs text-muted">
        <ThemeToggle />
        <Link href={inMovies ? "/" : "/movies"} className="hover:text-accent">
          {inMovies ? "음악" : "영화"}
        </Link>
        <Link href="/stats" className="hover:text-accent">
          통계
        </Link>
        <Link href="/tags" className="hover:text-accent">
          태그
        </Link>
        <Link href="/admin" className="hover:text-accent">
          관리자
        </Link>
      </nav>
    </header>
  );
}
