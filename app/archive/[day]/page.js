import Link from "next/link";
import { notFound } from "next/navigation";
import { buildArchive, getArchiveDay } from "../../../lib/archive";
import { valenceColor } from "../../../lib/keywords";

export function generateStaticParams() {
  return buildArchive().map((entry) => ({ day: entry.day }));
}

export async function generateMetadata({ params }) {
  const day = getArchiveDay((await params).day);
  if (!day) return {};
  return { title: `${day.day} 문화 기록 | Lyra` };
}

export default async function ArchiveDayPage({ params }) {
  const entry = getArchiveDay((await params).day);
  if (!entry) notFound();
  const all = buildArchive();
  const index = all.findIndex((day) => day.day === entry.day);

  return (
    <>
      <header className="mb-10 max-w-2xl">
        <p className="mb-2 text-xs text-muted">하루의 문화 기록</p>
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: entry.valence === null ? "var(--color-line)" : valenceColor(entry.valence) }}
          />
          <h1 className="text-3xl font-bold">{entry.day.replaceAll("-", ".")}</h1>
        </div>
        <p className="mt-3 text-sm text-muted">
          {[entry.dominant, entry.songs && `음악 ${entry.songs}곡`, entry.movies && `영화 ${entry.movies}편`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {entry.keywords.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {entry.keywords.slice(0, 8).map(([keyword, count]) => (
              <Link
                key={keyword}
                href={`/?q=${encodeURIComponent(keyword)}`}
                className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted hover:text-accent"
              >
                #{keyword}{count > 1 && <span className="ml-1 opacity-60">{count}</span>}
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="divide-y divide-line border-y border-line">
        {entry.items.map((item) => (
          <Link
            key={`${item.type}-${item.slug}`}
            href={item.type === "song" ? `/songs/${item.slug}` : `/movies/${item.slug}`}
            className="group grid grid-cols-[76px_minmax(0,1fr)] gap-4 py-5 sm:grid-cols-[96px_minmax(0,1fr)]"
          >
            <img
              src={item.image}
              alt=""
              className={`w-full border border-line object-cover ${
                item.type === "song" ? "aspect-square rounded" : "aspect-[2/3] rounded"
              }`}
            />
            <div className="min-w-0 self-center">
              <p className="text-[10px] uppercase text-muted">
                {item.type === "song" ? "Music" : item.media === "tv" ? "Drama" : "Film"}
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold group-hover:text-accent">{item.title}</h2>
              <p className="truncate text-xs text-muted">{item.subtitle}</p>
              {item.comment && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{item.comment}</p>}
            </div>
          </Link>
        ))}
      </div>

      <nav className="mt-10 flex justify-between text-sm text-muted">
        {all[index - 1] ? <Link href={`/archive/${all[index - 1].day}`}>← 이전 기록</Link> : <span />}
        <Link href={`/archive?month=${entry.day.slice(0, 7)}`} className="hover:text-accent">월별 목록</Link>
        {all[index + 1] ? <Link href={`/archive/${all[index + 1].day}`}>다음 기록 →</Link> : <span />}
      </nav>
    </>
  );
}
