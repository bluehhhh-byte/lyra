import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllMoviesRuntime } from "../../../lib/movies";
import { getMomentRuntime } from "../../../lib/moments";
import { momentDateLabel } from "../../../lib/moments-core";
import { getAllSongsRuntime } from "../../../lib/songs";
import CoverImage from "../../cover-image";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const moment = await getMomentRuntime(decodeURIComponent(slug));
  if (!moment) return {};
  return { title: `${moment.title} | Lyra.cyno`, description: moment.body.slice(0, 150) };
}

export default async function MomentPage({ params }) {
  const { slug } = await params;
  const moment = await getMomentRuntime(decodeURIComponent(slug));
  if (!moment) notFound();
  const [songs, movies] = await Promise.all([getAllSongsRuntime(), getAllMoviesRuntime()]);
  const songMap = new Map(songs.map((song) => [song.slug, song]));
  const movieMap = new Map(movies.map((movie) => [movie.slug, movie]));

  return (
    <article className="pb-16 pt-10">
      <header className="mx-auto mb-14 max-w-2xl text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-accent">Cultural moment</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-5xl">{moment.title}</h1>
        <time className="mt-5 block text-sm text-muted">{momentDateLabel(moment)}</time>
        {(moment.emotions.length > 0 || moment.keywords.length > 0) && <div className="mt-5 flex flex-wrap justify-center gap-2">{[...moment.emotions, ...moment.keywords].map((value) => <span key={value} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">{value}</span>)}</div>}
      </header>

      <div className="mx-auto max-w-2xl space-y-5 font-serif text-lg leading-[1.9]">
        {moment.body.split(/\n\s*\n/).map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)}
      </div>

      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="mb-6 text-sm font-semibold uppercase tracking-widest text-muted">이 장면을 이루는 작품</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {moment.links.map((link) => {
            const item = link.targetKind === "song" ? songMap.get(link.targetSlug) : movieMap.get(link.targetSlug);
            if (!item) return null;
            const href = `/${link.targetKind === "song" ? "songs" : "movies"}/${item.slug}`;
            const image = link.targetKind === "song" ? item.artwork : item.poster;
            const title = link.targetKind === "song" ? item.title : item.title_ko || item.title;
            const subtitle = link.targetKind === "song" ? item.artist : item.director_ko || item.director;
            return <Link key={`${link.targetKind}:${link.targetSlug}`} href={href} className="group overflow-hidden rounded-xl border border-line bg-surface/50 transition hover:border-accent/60">
              <div className="flex gap-4 p-4">
                <div className={`h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-bg ${link.targetKind === "movie" ? "w-16" : ""}`}>
                  {link.targetKind === "song" ? <CoverImage src={image} alt="" className="h-full w-full object-cover" /> : image ? <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
                </div>
                <div className="min-w-0 py-1"><p className="text-[10px] uppercase tracking-wider text-accent">{link.targetKind === "song" ? "Lyra" : "Cyno"}</p><h3 className="mt-1 truncate font-semibold group-hover:text-accent">{title}</h3><p className="truncate text-xs text-muted">{subtitle}</p>{link.note && <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted">{link.note}</p>}</div>
              </div>
              {link.excerpt && <blockquote className="border-t border-line px-4 py-3 font-serif text-sm leading-relaxed">“{link.excerpt}”</blockquote>}
            </Link>;
          })}
        </div>
      </section>
      <div className="mx-auto mt-16 max-w-2xl"><Link href="/moments" className="text-sm text-muted hover:text-accent">← 모든 문화 장면</Link></div>
    </article>
  );
}
