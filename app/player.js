"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Scope from "./scope";

// The <audio> element lives here, in the layout — a client-side route change
// re-renders the page but not this provider, so a preview keeps playing while
// you page through songs (and while auto-advance navigates to the next one).
const PlayerCtx = createContext({
  track: null,
  setTrack: () => {},
  playlist: [],
  shuffle: false,
  setShuffle: () => {},
});

export const usePlayer = () => useContext(PlayerCtx);

// Native <audio controls> renders the OS's own play button, which clashes with
// any custom prev/next buttons sitting next to it — that mismatch is the "촌스러움"
// being fixed here. So controls are fully custom: same icon-button family for
// prev/play/next, sized so play reads as the primary action.
function Icon({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  play: "M7 4l14 8-14 8z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  prev: "M6 5h2v14H6zM20 5v14l-11-7z",
  next: "M16 5h2v14h-2zM4 5l11 7-11 7z",
  shuffle:
    "M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
  repeat: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
  close: "M6.4 4.9L12 10.5l5.6-5.6 1.4 1.4L13.4 12l5.6 5.6-1.4 1.4L12 13.4l-5.6 5.6-1.4-1.4L10.6 12 5 6.4z",
};

function CircleButton({ icon, label, onClick, primary, active, size = 16 }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={
        primary
          ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-bg transition hover:opacity-90 active:scale-95"
          : `flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
              active
                ? "border-accent text-accent"
                : "border-line text-muted hover:border-accent hover:text-accent"
            }`
      }
    >
      <Icon d={ICONS[icon]} size={size} />
    </button>
  );
}

export default function PlayerProvider({ children }) {
  const [track, setTrack] = useState(null); // one of `playlist`, or null
  // The playlist (every song with a preview) used to be serialized into the RSC
  // payload of every page, on every navigation, whether or not anything played.
  // It is only needed once something is playing — prev/next/shuffle/auto-advance —
  // so it is fetched the first time a track starts and kept for the session.
  const [playlist, setPlaylist] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false); // random order for prev/next/auto-advance
  // 미리듣기는 스토어가 홍보용으로 주는 30초다. 끝났다고 다음 곡으로 계속 넘어가면
  // 감상 서비스처럼 동작하므로 기본은 꺼 둔다 — 켜는 건 방문자의 선택.
  const [continuous, setContinuous] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const audioRef = useRef(null);
  const barRef = useRef(null);
  const router = useRouter();

  const index = track ? playlist.findIndex((s) => s.slug === track.slug) : -1;
  const hasNeighbors = index >= 0 && playlist.length > 1;

  // step to another track and follow it to its page, so the lyrics on screen
  // match what's playing. Playback continues across the client-side navigation.
  const go = (delta) => {
    if (index < 0 || playlist.length === 0) return;
    let next;
    if (shuffle && playlist.length > 1) {
      // any random track but the current one
      let j;
      do j = Math.floor(Math.random() * playlist.length);
      while (j === index);
      next = playlist[j];
    } else {
      next = playlist[(index + delta + playlist.length) % playlist.length];
    }
    setTrack(next);
    router.push(`/songs/${next.slug}`);
  };

  useEffect(() => {
    setProgress(0);
  }, [track?.preview]);

  useEffect(() => {
    if (!track || playlist.length) return;
    let alive = true;
    fetch("/api/playlist")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => alive && setPlaylist(j.items || []))
      .catch(() => {}); // 실패해도 재생 자체는 된다 — 이전·다음만 비활성
    return () => { alive = false; };
  }, [track, playlist.length]);

  // Lock-screen / control-center metadata and transport controls. Re-registered
  // per track so the handlers close over the current index/shuffle.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (!track) {
      ms.metadata = null;
      return;
    }
    ms.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: "Lyra 미리듣기",
      artwork: [{ src: track.artwork, sizes: "600x600", type: "image/jpeg" }],
    });
    ms.setActionHandler("play", () => audioRef.current?.play());
    ms.setActionHandler("pause", () => audioRef.current?.pause());
    ms.setActionHandler("previoustrack", hasNeighbors ? () => go(-1) : null);
    ms.setActionHandler("nexttrack", hasNeighbors ? () => go(1) : null);
    return () => {
      for (const a of ["play", "pause", "previoustrack", "nexttrack"])
        ms.setActionHandler(a, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, index, shuffle]);

  const seek = (clientX) => {
    const el = barRef.current;
    const audio = audioRef.current;
    if (!el || !audio?.duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  };

  return (
    <PlayerCtx.Provider value={{ track, setTrack, playlist, shuffle, setShuffle }}>
      {children}
      {track && (
        <div className="fixed inset-x-0 bottom-0 z-30 translate-y-0 border-t border-line bg-surface/95 backdrop-blur transition-transform duration-300 ease-drawer starting:translate-y-full motion-reduce:transition-none">
          {/* thin, clickable progress line spanning the whole bar — doubles as a seek control */}
          <div
            ref={barRef}
            onClick={(e) => seek(e.clientX)}
            onKeyDown={(event) => {
              if (!audio || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
              event.preventDefault();
              audio.currentTime = Math.min(audio.duration || 30, Math.max(0, audio.currentTime + (event.key === "ArrowRight" ? 5 : -5)));
            }}
            role="slider"
            tabIndex={0}
            aria-label="미리듣기 재생 위치"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="absolute inset-x-0 top-0 h-3 -translate-y-1/2 cursor-pointer"
          >
            <div className="mt-1 h-[3px] overflow-hidden bg-line">
              {/* scaleX, not width — width re-layouts 4×/sec; transform stays on the GPU */}
              <div
                className="h-full w-full origin-left bg-accent"
                style={{ transform: `scaleX(${progress})`, transition: "transform 150ms linear" }}
              />
            </div>
          </div>

          <div className="mx-auto flex max-w-5xl items-center gap-2 px-5 py-3 sm:gap-3">
            <img src={track.artwork} alt="" className="h-11 w-11 shrink-0 rounded" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{track.title}</p>
              {/* 미리듣기·커버는 스토어가 홍보용으로 제공하는 것이다 — 어디서 왔는지
                  밝히고 그 곡의 스토어 페이지로 갈 수 있게 해 둔다 */}
              <p className="truncate text-xs text-muted">
                {track.artist} · 미리듣기 30초
                {track.externalUrl ? (
                  <>
                    {" · "}
                    <a
                      href={track.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-line underline-offset-2 hover:text-accent"
                    >
                      {track.provider === "deezer" ? "Deezer" : "Apple Music"}에서 듣기
                    </a>
                  </>
                ) : null}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {hasNeighbors && (
                <CircleButton
                  icon="repeat"
                  label={continuous ? "연속 재생 끄기" : "연속 재생 켜기"}
                  active={continuous}
                  size={14}
                  onClick={() => setContinuous((c) => !c)}
                />
              )}
              {hasNeighbors && continuous && (
                <CircleButton
                  icon="shuffle"
                  label={shuffle ? "셔플 끄기" : "셔플 켜기"}
                  active={shuffle}
                  size={14}
                  onClick={() => setShuffle((s) => !s)}
                />
              )}
              {hasNeighbors && <CircleButton icon="prev" label="이전 곡" onClick={() => go(-1)} />}
              <CircleButton
                icon={playing ? "pause" : "play"}
                label={playing ? "일시정지" : "재생"}
                primary
                size={18}
                onClick={() => (playing ? audioRef.current?.pause() : audioRef.current?.play())}
              />
              {hasNeighbors && <CircleButton icon="next" label="다음 곡" onClick={() => go(1)} />}
            </div>

            <Scope key={`scope-${track.preview}`} audioRef={audioRef} />

            {/* remount on src change so the new preview autoplays; on end, advance */}
            <audio
              key={track.preview}
              ref={audioRef}
              src={track.preview}
              crossOrigin="anonymous"
              autoPlay
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => {
                const a = e.currentTarget;
                if (!a.duration) return;
                setProgress(a.currentTime / a.duration);
                // soften the 30s preview's hard edges: ~1.5s fade-in, ~2.5s fade-out.
                // ponytail: timeupdate fires ~4Hz so the ramp is stepped; iOS ignores
                // element volume entirely — both fine for a preview.
                a.volume = Math.max(
                  0,
                  Math.min(1, a.currentTime / 1.5, (a.duration - a.currentTime) / 2.5)
                );
              }}
              onEnded={() => (continuous && hasNeighbors ? go(1) : setTrack(null))}
              className="hidden"
            />

            <CircleButton icon="close" label="플레이어 닫기" onClick={() => setTrack(null)} />
          </div>
        </div>
      )}
    </PlayerCtx.Provider>
  );
}
