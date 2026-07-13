// Served as /manifest.webmanifest and auto-linked by Next — makes the site
// installable on a phone home screen (standalone, no browser chrome).
export default function manifest() {
  return {
    name: "Lyra — 가사 컬렉션",
    short_name: "Lyra",
    description: "좋아하는 노래의 가사와 한글 번역을 모아두는 곳",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0d0f",
    theme_color: "#0d0d0f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
