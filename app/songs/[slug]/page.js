import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllSongs, getSong } from "../../../lib/songs";
import LyricsView from "./lyrics-view";

export function generateStaticParams() {
  return getAllSongs().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const song = getSong(decodeURIComponent(slug));
  if (!song) return {};
  const title = `${song.title} — ${song.artist}`;
  const description = song.comment || `${song.title} 가사와 한글 번역`;
  return {
    title: `${title} | Lyra`,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: song.artwork, width: 600, height: 600 }],
      type: "article",
    },
    twitter: { card: "summary", title, description, images: [song.artwork] },
  };
}

function relatedSongs(song, all) {
  const tags = new Set(song.tags);
  return all
    .filter((s) => s.slug !== song.slug)
    .map((s) => {
      let score = 0;
      if (s.artist === song.artist) score += 5;
      score += s.tags.filter((t) => tags.has(t)).length;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.s);
}

export default async function SongPage({ params }) {
  const { slug } = await params;
  const all = getAllSongs();
  const song = all.find((s) => s.slug === decodeURIComponent(slug));
  if (!song) notFound();
  const related = relatedSongs(song, all);

  return (
    <article>
      {/* hero */}
      <div className="relative mb-12 overflow-hidden rounded-2xl border border-line">
        <img
          src={song.artwork}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl"
        />
        <div className="relative flex flex-col items-center gap-6 px-6 py-12 sm:flex-row sm:items-end sm:px-10">
          <img
            src={song.artwork}
            alt={`${song.title} album art`}
            className="w-40 rounded-xl shadow-2xl sm:w-48"
          />
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{song.title}</h1>
            {song.title_ko && song.title_ko !== song.title && (
              <p className="mt-1 text-lg text-muted">{song.title_ko}</p>
            )}
            <p className="mt-2 text-muted">
              {[
                song.artist_ko && song.artist_ko !== song.artist
                  ? `${song.artist} (${song.artist_ko})`
                  : song.artist,
                song.album,
                song.year,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {song.tags.map((t) => (
                <Link
                  key={t}
                  href={`/?tag=${encodeURIComponent(t)}`}
                  className="rounded-full border border-line bg-bg/50 px-2.5 py-0.5 text-xs text-muted hover:text-accent"
                >
                  {t}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center gap-3 sm:justify-start">
              {song.preview && (
                <audio controls preload="none" src={song.preview} className="h-9 max-w-56" />
              )}
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${song.artist} ${song.title}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-line bg-bg/50 px-3 py-1.5 text-xs text-muted hover:text-accent"
              >
                ▶ YouTube
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* comment */}
      {song.comment && (
        <p className="mx-auto mb-14 max-w-2xl border-l-2 border-accent pl-4 text-sm leading-relaxed text-muted">
          {song.comment}
        </p>
      )}

      {/* lyrics */}
      <LyricsView stanzas={song.stanzas} lang={song.lang} />

      {/* related */}
      {related.length > 0 && (
        <div className="mx-auto mt-20 max-w-2xl">
          <h2 className="mb-4 text-sm font-semibold text-muted">이런 곡도</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
            {related.map((s) => (
              <Link key={s.slug} href={`/songs/${s.slug}`} className="group">
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  <img
                    src={s.artwork}
                    alt=""
                    className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <h3 className="mt-2 truncate text-xs font-medium group-hover:text-accent">
                  {s.title}
                </h3>
                <p className="truncate text-xs text-muted">{s.artist}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto mt-16 flex max-w-2xl justify-between">
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← 컬렉션으로
        </Link>
        {process.env.NODE_ENV !== "production" && (
          <Link href={`/admin/edit/${song.slug}`} className="text-sm text-muted hover:text-accent">
            수정 ✎
          </Link>
        )}
      </div>
    </article>
  );
}
