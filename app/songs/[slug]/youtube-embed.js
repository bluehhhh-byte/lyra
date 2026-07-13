"use client";
import { useState } from "react";
import { usePlayer } from "../../player";

// No video id is stored, so /api/youtube resolves "artist title" to the first
// search result's id on demand (listType=search embeds no longer work).
// Opening the video stops the 30s preview so the two never talk over each other.
export default function YouTubeEmbed({ artist, title }) {
  const [open, setOpen] = useState(false);
  const [videoId, setVideoId] = useState(undefined); // undefined=loading, null=not found
  const { setTrack } = usePlayer();
  const q = `${artist} ${title}`;

  const toggle = () => {
    if (!open) {
      setTrack(null); // stop the preview before the video starts
      if (videoId === undefined)
        fetch(`/api/youtube?q=${encodeURIComponent(q)}`)
          .then((r) => r.json())
          .then((d) => setVideoId(d.id ?? null))
          .catch(() => setVideoId(null));
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        onClick={toggle}
        className="rounded-full border border-line bg-bg/50 px-3 py-1.5 text-xs text-muted hover:text-accent"
      >
        {open ? "✕ YouTube 닫기" : "▶ YouTube"}
      </button>
      {open && (
        <div className="mt-3 w-full basis-full">
          {videoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
              title={`YouTube: ${q}`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full rounded-xl border border-line"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-line text-xs text-muted">
              {videoId === undefined ? "영상 찾는 중…" : "영상을 찾지 못했습니다"}
            </div>
          )}
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
