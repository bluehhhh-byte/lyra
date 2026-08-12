"use client";
import Link from "next/link";
import CoverImage from "../../cover-image";
import { usePlayer } from "../../player";

// 경로의 정거장 목록 — 번호·아트워크·이유, ▶로 30초 미리듣기.
// 컬렉션 곡(slug)은 제목이 곡 페이지로 링크된다.
export default function PathSteps({ steps }) {
  const { track, setTrack } = usePlayer();

  return (
    <ol className="mt-4 space-y-3">
      {steps.map((s, i) => {
        const playing = track?.preview && track.preview === s.preview;
        return (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-1 w-5 shrink-0 text-right text-xs tabular-nums text-muted/60">{i + 1}</span>
            <button
              onClick={() => s.preview && setTrack({ title: s.title, artist: s.artist, artwork: s.artwork, preview: s.preview })}
              disabled={!s.preview}
              aria-label={`${s.title} 미리듣기`}
              className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border transition ${
                playing ? "border-accent ring-2 ring-accent/40" : "border-line"
              } ${s.preview ? "cursor-pointer" : "cursor-default"}`}
            >
              <CoverImage src={s.artwork} alt="" label={s.title} loading="lazy" className="h-full w-full object-cover" />
              {s.preview && !playing && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white opacity-100 sm:opacity-0 sm:hover:opacity-100" aria-hidden>
                  ▶
                </span>
              )}
            </button>
            <div className="min-w-0 pt-0.5">
              {s.slug ? (
                <Link href={`/songs/${s.slug}`} className="block truncate text-sm font-medium hover:text-accent">
                  {s.title} <span className="font-normal text-muted">· {s.artist}</span>
                  <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">컬렉션</span>
                </Link>
              ) : (
                <p className="truncate text-sm font-medium">
                  {s.title} <span className="font-normal text-muted">· {s.artist}</span>
                </p>
              )}
              {s.reason && <p className="mt-0.5 text-xs leading-snug text-muted/80">{s.reason}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
