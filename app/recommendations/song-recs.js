"use client";
import CoverImage from "../cover-image";
import { usePlayer } from "../player";

// 추천 곡 그리드. 카드는 세 층으로 분리된다:
//   표지 = 미리듣기 버튼(또는 미리듣기 없으면 유튜브 링크)
//   제목·이유 = 일반 텍스트
//   근거 = 실존 곡·장르·감정 링크 (구조화 basedOn의 가치가 여기서 완성된다)
// 모바일(hover 없음)에선 ▶가 항상 보이고, 재생 중인 카드는 테두리로 구분.
export default function SongRecs({ items }) {
  const { track, setTrack } = usePlayer();

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((s) => {
        const playing = track?.preview && track.preview === s.preview;

        const cover = (
          <div
            className={`relative overflow-hidden  border bg-surface transition ${
              playing ? "border-accent ring-2 ring-accent/40" : "border-line"
            }`}
          >
            <CoverImage
              src={s.artwork}
              alt={s.title}
              label={s.title}
              loading="lazy"
              className="aspect-square w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
            />
            {s.preview ? (
              playing ? (
                <span className="absolute bottom-2 right-2  bg-accent px-2.5 py-1 text-[10px] font-semibold text-bg backdrop-blur">
                  재생 중
                </span>
              ) : (
                <span
                  className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center  bg-black/60 text-sm text-white opacity-100 backdrop-blur transition sm:opacity-0 sm:group-hover:opacity-100"
                  aria-hidden
                >
                  ▶
                </span>
              )
            ) : (
              <span className="absolute bottom-2 right-2  bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur">
                미리듣기 없음 · YouTube ↗
              </span>
            )}
          </div>
        );

        return (
          <div key={s.trackId} className="group">
            {s.preview ? (
              <button
                onClick={() => setTrack({ title: s.title, artist: s.artist, artwork: s.artwork, preview: s.preview })}
                className="block w-full text-left"
                aria-label={`${s.title} 미리듣기`}
              >
                {cover}
              </button>
            ) : (
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${s.artist} ${s.title}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                aria-label={`${s.title} YouTube에서 찾기`}
              >
                {cover}
              </a>
            )}
            <p className="mt-2 truncate text-sm font-semibold">{s.title}</p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {s.artist}
              {s.year ? ` · ${s.year}` : ""}
            </p>
            {s.why && <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-muted">{s.why}</p>}
          </div>
        );
      })}
    </div>
  );
}
