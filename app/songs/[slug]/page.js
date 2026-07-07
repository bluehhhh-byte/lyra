import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllSongs, getSong } from "../../../lib/songs";

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

export default async function SongPage({ params }) {
  const { slug } = await params;
  const song = getSong(decodeURIComponent(slug));
  if (!song) notFound();

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
      <div className="mx-auto max-w-2xl space-y-10">
        {song.stanzas.map((stanza, i) => (
          <section key={i}>
            {stanza.section && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
                {stanza.section}
              </p>
            )}
            <div className="space-y-4">
              {stanza.lines.map((line, j) => (
                <div key={j}>
                  <p lang={song.lang || "en"} className="font-serif text-lg leading-snug">
                    {line.en}
                  </p>
                  {line.reading && (
                    <p className="mt-0.5 text-xs text-muted/70">{line.reading}</p>
                  )}
                  {line.ko && <p className="mt-0.5 text-sm text-muted">{line.ko}</p>}
                </div>
              ))}
            </div>
            {stanza.note && (
              <p className="mt-4 rounded-lg bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
                <span className="mr-1.5 font-semibold text-accent">노트</span>
                {stanza.note}
              </p>
            )}
          </section>
        ))}
      </div>

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
