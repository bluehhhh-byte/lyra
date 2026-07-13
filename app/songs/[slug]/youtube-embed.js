"use client";
import { useState } from "react";
import { usePlayer } from "../../player";

// No video id is stored, so this embeds YouTube's search playlist for
// "artist title" — the first result starts playing. Opening it stops the
// 30s preview player so the two never talk over each other.
export default function YouTubeEmbed({ artist, title }) {
  const [open, setOpen] = useState(false);
  const { setTrack } = usePlayer();
  const q = `${artist} ${title}`;

  return (
    <>
      <button
        onClick={() => {
          if (!open) setTrack(null); // stop the preview before the video starts
          setOpen((v) => !v);
        }}
        className="rounded-full border border-line bg-bg/50 px-3 py-1.5 text-xs text-muted hover:text-accent"
      >
        {open ? "✕ YouTube 닫기" : "▶ YouTube"}
      </button>
      {open && (
        <div className="mt-3 w-full basis-full">
          <iframe
            src={`https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(q)}&autoplay=1`}
            title={`YouTube: ${q}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full rounded-xl border border-line"
          />
          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs text-muted hover:text-accent"
          >
            YouTube에서 열기 ↗
          </a>
        </div>
      )}
    </>
  );
}
