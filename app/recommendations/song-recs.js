"use client";
import CoverImage from "../cover-image";
import { usePlayer } from "../player";

// 추천 곡 그리드 — 카드의 ▶로 전역 플레이어에 30초 미리듣기를 건다.
// 컬렉션 곡이 아니라 개별 페이지가 없으니 카드의 행동은 '들어보기' 하나다.
export default function SongRecs({ items }) {
  const { track, setTrack } = usePlayer();

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((s) => {
        const playing = track?.preview && track.preview === s.preview;
        const inner = (
          <>
            <div className="relative overflow-hidden rounded-xl border border-line bg-surface">
              <CoverImage
                src={s.artwork}
                alt={s.title}
                label={s.title}
                loading="lazy"
                className="aspect-square w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
              />
              {s.preview ? (
                <span
                  className={`absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full text-sm backdrop-blur transition ${
                    playing ? "bg-accent text-bg" : "bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  }`}
                  aria-hidden
                >
                  ▶
                </span>
              ) : (
                // iTunes에 미리듣기가 없는 곡 — 이유를 보여주고 카드는 유튜브 검색으로
                <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur">
                  미리듣기 없음 · YouTube ↗
                </span>
              )}
            </div>
            <p className="mt-2 truncate text-sm font-semibold group-hover:text-accent">{s.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {s.artist}
              {s.year ? ` · ${s.year}` : ""}
            </p>
            {s.why && <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-muted/80">{s.why}</p>}
          </>
        );
        return s.preview ? (
          <button
            key={s.trackId}
            onClick={() => setTrack({ title: s.title, artist: s.artist, artwork: s.artwork, preview: s.preview })}
            className="group text-left"
            aria-label={`${s.title} 미리듣기`}
          >
            {inner}
          </button>
        ) : (
          <a
            key={s.trackId}
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${s.artist} ${s.title}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group text-left"
            aria-label={`${s.title} YouTube에서 찾기`}
          >
            {inner}
          </a>
        );
      })}
    </div>
  );
}
