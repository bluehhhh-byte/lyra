"use client";
import { createContext, useContext, useState } from "react";

// The <audio> element lives here, in the layout — a client-side route change
// re-renders the page but not this provider, so a preview keeps playing while
// you page through songs. Keeping it inside the song page would kill it.
const PlayerCtx = createContext({ track: null, setTrack: () => {} });

export const usePlayer = () => useContext(PlayerCtx);

export default function PlayerProvider({ children }) {
  const [track, setTrack] = useState(null); // { slug, title, artist, artwork, preview }

  return (
    <PlayerCtx.Provider value={{ track, setTrack }}>
      {children}
      {track && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
            <img src={track.artwork} alt="" className="h-11 w-11 rounded" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{track.title}</p>
              <p className="truncate text-xs text-muted">{track.artist} · 미리듣기 30초</p>
            </div>
            {/* remount on src change so the new preview autoplays */}
            <audio
              key={track.preview}
              src={track.preview}
              controls
              autoPlay
              onEnded={() => setTrack(null)}
              className="h-9 w-40 sm:w-72"
            />
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
