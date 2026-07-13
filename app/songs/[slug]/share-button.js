"use client";
import { useState } from "react";

// Mobile gets the native share sheet (KakaoTalk, Instagram, …); desktop
// browsers without navigator.share fall back to copying the link.
export default function ShareButton({ title, artist }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = location.href.split("#")[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} — ${artist} | Lyra`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {} // user dismissed the share sheet — not an error
  };

  return (
    <button
      onClick={share}
      className="rounded-full border border-line bg-bg/50 px-3 py-1.5 text-xs text-muted hover:text-accent"
    >
      {copied ? "링크 복사됨 ✓" : "↗ 공유"}
    </button>
  );
}
