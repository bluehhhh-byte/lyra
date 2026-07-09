"use client";
import { createContext, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Scope from "./scope";

// The <audio> element lives here, in the layout — a client-side route change
// re-renders the page but not this provider, so a preview keeps playing while
// you page through songs (and while auto-advance navigates to the next one).
const PlayerCtx = createContext({ track: null, setTrack: () => {} });

export const usePlayer = () => useContext(PlayerCtx);

export default function PlayerProvider({ playlist = [], children }) {
  const [track, setTrack] = useState(null); // one of `playlist`, or null
  const audioRef = useRef(null);
  const router = useRouter();

  const index = track ? playlist.findIndex((s) => s.slug === track.slug) : -1;

  // step to another track and follow it to its page, so the lyrics on screen
  // match what's playing. Playback continues across the client-side navigation.
  const go = (delta) => {
    if (index < 0 || playlist.length === 0) return;
    const next = playlist[(index + delta + playlist.length) % playlist.length];
    setTrack(next);
    router.push(`/songs/${next.slug}`);
  };

  return (
    <PlayerCtx.Provider value={{ track, setTrack }}>
      {children}
      {track && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-5 py-3 sm:gap-3">
            <img src={track.artwork} alt="" className="h-11 w-11 rounded" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{track.title}</p>
              <p className="truncate text-xs text-muted">{track.artist} · 미리듣기 30초</p>
            </div>

            {index >= 0 && playlist.length > 1 && (
              <button
                onClick={() => go(-1)}
                aria-label="이전 곡"
                className="px-1 text-muted hover:text-accent"
              >
                ⏮
              </button>
            )}

            <Scope key={`scope-${track.preview}`} audioRef={audioRef} />
            {/* remount on src change so the new preview autoplays; on end, advance */}
            <audio
              key={track.preview}
              ref={audioRef}
              src={track.preview}
              crossOrigin="anonymous"
              controls
              autoPlay
              onEnded={() => (index >= 0 && playlist.length > 1 ? go(1) : setTrack(null))}
              className="h-9 w-32 sm:w-64"
            />

            {index >= 0 && playlist.length > 1 && (
              <button
                onClick={() => go(1)}
                aria-label="다음 곡"
                className="px-1 text-muted hover:text-accent"
              >
                ⏭
              </button>
            )}
            <button
              onClick={() => setTrack(null)}
              aria-label="플레이어 닫기"
              className="px-1 text-muted hover:text-accent"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </PlayerCtx.Provider>
  );
}
