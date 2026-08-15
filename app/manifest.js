// Served as /manifest.webmanifest and auto-linked by Next — makes the site
// installable on a phone home screen (standalone, no browser chrome).
export default function manifest() {
  return {
    name: "Lyra — The Words that Shaped the World",
    short_name: "Lyra",
    description: "가사와 번역, 영화와 별점을 시간의 순서로 모은 기록",
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
