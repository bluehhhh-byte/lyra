import "./globals.css";
import Link from "next/link";
import PlayerProvider from "./player";
import { SITE_URL } from "../lib/site";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Lyra — 가사 컬렉션",
  description: "좋아하는 노래의 가사와 한글 번역을 모아두는 곳",
  openGraph: {
    siteName: "Lyra",
    title: "Lyra — 가사 컬렉션",
    description: "좋아하는 노래의 가사와 한글 번역을 모아두는 곳",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="font-sans min-h-screen">
        <PlayerProvider>
        <header className="mx-auto flex max-w-5xl items-baseline justify-between px-5 py-8">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Lyra<span className="text-accent">.</span>
          </Link>
          <nav className="flex items-baseline gap-4 text-xs text-muted">
            <span className="hidden sm:inline">가사 · 번역 컬렉션</span>
            <Link href="/tags" className="hover:text-accent">
              태그
            </Link>
            <Link href="/admin" className="hover:text-accent">
              관리자
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-5 pb-24">{children}</main>
        <footer className="mx-auto max-w-5xl px-5 pb-10 text-xs text-muted">
          가사의 저작권은 원저작자에게 있습니다. 번역과 코멘트는 개인 감상입니다.
        </footer>
        </PlayerProvider>
      </body>
    </html>
  );
}
