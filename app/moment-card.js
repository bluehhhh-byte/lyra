import Link from "next/link";
import { momentDateLabel } from "../lib/moments-core";

export default function MomentCard({ moment, compact = false }) {
  const songCount = moment.links.filter((link) => link.targetKind === "song").length;
  const movieCount = moment.links.filter((link) => link.targetKind === "movie").length;
  return (
    <Link href={`/moments/${encodeURIComponent(moment.slug)}`} className="group block  border border-line bg-surface/40 p-5 transition hover:border-accent/60 hover:bg-surface">
      <time className="text-[11px] tracking-wide text-accent">{momentDateLabel(moment)}</time>
      <h2 className={`${compact ? "mt-1 text-base" : "mt-2 text-xl"} font-semibold group-hover:text-accent`}>{moment.title}</h2>
      {!compact && <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted">{moment.body}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        {songCount > 0 && <span>노래 {songCount}</span>}
        {movieCount > 0 && <span>영화 {movieCount}</span>}
        {moment.emotions.slice(0, 3).map((emotion) => <span key={emotion} className=" bg-accent/10 px-2 py-0.5 text-accent">{emotion}</span>)}
      </div>
    </Link>
  );
}
