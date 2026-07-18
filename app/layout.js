import "./globals.css";
import PlayerProvider from "./player";
import Header from "./header";
import { SITE_URL } from "../lib/site";
import { THEME_KEY } from "../lib/theme";
import { getAllSongs } from "../lib/songs";

// Runs before the first paint, so a reader who picked light never sees dark flash.
// Dark is the default — anything but a stored "light" resolves to it.
const NO_FLASH = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)})==="light"?"light":"dark";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}`;

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Lyra — 가사 컬렉션",
  description: "좋아하는 노래의 가사와 한글 번역을 모아두는 곳",
  openGraph: {
    siteName: "Lyra",
    title: "Lyra — 가사 컬렉션",
    description: "좋아하는 노래의 가사와 한글 번역을 모아두는 곳",
  },
  // iOS ignores the manifest — it needs its own meta tags to install standalone
  appleWebApp: { capable: true, title: "Lyra", statusBarStyle: "black" },
};

// lets the UA theme native widgets too — the player's <audio> controls,
// scrollbars, and the admin form inputs. Dark first: it is the default.
export const viewport = { colorScheme: "dark light" };

export default function RootLayout({ children }) {
  // playlist for the player's prev/next + auto-advance — only songs with a preview,
  // in the collection's default order (same as the home grid)
  const playlist = getAllSongs()
    .filter((s) => s.preview)
    .map((s) => ({
      slug: s.slug,
      title: s.title,
      artist: s.artist,
      artwork: s.artwork,
      preview: s.preview,
    }));

  return (
    // the no-flash script mutates <html> before hydration — that mismatch is intended
    <html lang="ko" suppressHydrationWarning>
      <body className="font-sans min-h-screen">
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
        <PlayerProvider playlist={playlist}>
        <Header />
        <main className="mx-auto max-w-5xl px-5 pb-24">{children}</main>
        <footer className="mx-auto max-w-5xl px-5 pb-10 text-xs text-muted">
          가사의 저작권은 원저작자에게 있습니다. 번역과 코멘트는 개인 감상입니다.
        </footer>
        </PlayerProvider>
      </body>
    </html>
  );
}
