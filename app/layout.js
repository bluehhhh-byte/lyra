import "./globals.css";
import PlayerProvider from "./player";
import Header from "./header";
import UsageReporter from "./usage-reporter";
import { usageMetricsEnabled } from "../lib/usage-metrics-core";
import { SITE_URL } from "../lib/site";
import { THEME_KEY } from "../lib/theme";


// Runs before the first paint, so a reader who picked light never sees dark flash.
// Dark is the default — anything but a stored "light" resolves to it.
const NO_FLASH = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)})==="light"?"light":"dark";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}`;

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Lyra — The Words that Shaped the World",
  description: "가사와 번역, 영화와 별점을 시간의 순서로 모은 기록 — 한 줄의 문장이 세계를 이해하는 방식에 남긴 흔적",
  openGraph: {
    siteName: "Lyra",
    title: "Lyra — The Words that Shaped the World",
    description: "가사와 번역, 영화와 별점을 시간의 순서로 모은 기록 — 한 줄의 문장이 세계를 이해하는 방식에 남긴 흔적",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "Lyra — 가사와 번역, 영화의 기록" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/opengraph-image.png"],
  },
  // iOS ignores the manifest — it needs its own meta tags to install standalone
  appleWebApp: { capable: true, title: "Lyra", statusBarStyle: "black" },
  // 개인 기록이다. 색인도 링크 추적도 원하지 않는다 — app/robots.js와 한 쌍이고,
  // next.config.mjs의 X-Robots-Tag 헤더가 같은 말을 한 번 더 한다. 메타 태그는
  // HTML을 파싱한 봇에게만 닿고, 헤더는 이미지·JSON 응답에도 붙는다.
  robots: { index: false, follow: false, nocache: true },
};

// lets the UA theme native widgets too — the player's <audio> controls,
// scrollbars, and the admin form inputs. Dark first: it is the default.
export const viewport = { colorScheme: "dark light" };

export default function RootLayout({ children }) {
  return (
    // the no-flash script mutates <html> before hydration — that mismatch is intended
    <html lang="ko" suppressHydrationWarning>
      <body className="font-sans min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-3 focus:font-semibold focus:text-bg"
        >
          본문으로 건너뛰기
        </a>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
        <PlayerProvider>
        {/* 계측은 기본 off — 켜지 않으면 방문자 브라우저가 비콘을 보내지 않는다 */}
        {usageMetricsEnabled() && <UsageReporter />}
        <Header />
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-5 pb-24">{children}</main>
        <footer className="mx-auto max-w-5xl px-5 pb-10 text-xs text-muted">
          가사의 저작권은 원저작자에게 있습니다. 번역과 코멘트는 개인 감상입니다.
          <br />
          앨범 커버와 30초 미리듣기는 Apple(iTunes Search API)·Deezer가 제공하며, 각 곡 페이지의
          스토어 링크로 연결됩니다. 저장하지 않고 원본 주소에서 바로 재생합니다.
        </footer>
        </PlayerProvider>
      </body>
    </html>
  );
}
