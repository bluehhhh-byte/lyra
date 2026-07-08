"use client";
import { usePlayer } from "../../player";

export default function PlayButton({ track }) {
  const { track: current, setTrack } = usePlayer();
  const playing = current?.slug === track.slug;

  return (
    <button
      onClick={() => setTrack(playing ? null : track)}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        playing
          ? "border-accent bg-accent font-semibold text-bg"
          : "border-line bg-bg/50 text-muted hover:text-accent"
      }`}
    >
      {playing ? "■ 정지" : "▶ 미리듣기"}
    </button>
  );
}
