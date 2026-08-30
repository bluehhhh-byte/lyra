import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonRuntime } from "../../../lib/people";
import CoverImage from "../../cover-image";

export async function generateMetadata({ params }) {
  const person = await getPersonRuntime(decodeURIComponent((await params).name));
  if (!person) return {};
  return { title: `${person.name} | Cyno.` };
}

function FilmGrid({ films }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-5">
      {films.map((movie) => {
        const inner = movie.href?.startsWith("/");
        const Card = (
          <>
            <CoverImage src={movie.poster} alt="" label={movie.title_ko || movie.title} className="aspect-[2/3] w-full  border border-line object-cover" />
            <h3 className="mt-2 truncate text-sm font-semibold group-hover:text-accent">{movie.title_ko || movie.title}</h3>
            <p className="mt-0.5 truncate text-xs text-muted">
              {movie.year}{movie.rating != null ? ` · ★ ${movie.rating}` : " · 별점 없음"}
            </p>
          </>
        );
        if (!movie.href) return <div key={movie.key} className="group">{Card}</div>;
        return inner ? (
          <Link key={movie.key} href={movie.href} className="group">{Card}</Link>
        ) : (
          <a key={movie.key} href={movie.href} target="_blank" rel="noopener noreferrer" className="group">{Card}</a>
        );
      })}
    </div>
  );
}

export default async function PersonPage({ params }) {
  const person = await getPersonRuntime(decodeURIComponent((await params).name));
  if (!person) notFound();
  const roles = [
    person.directed.length && `감독 ${person.directed.length}편`,
    person.acted.length && `출연 ${person.acted.length}편`,
  ].filter(Boolean);
  const actingOnly = person.acted.filter((movie) => !person.directed.some((directed) => directed.key === movie.key));

  return (
    <>
      <header className="mb-10">
        <p className="mb-1 text-xs text-muted">{roles.join(" · ")}</p>
        <h1 className="text-3xl font-bold">{person.name}</h1>
        {person.averageRating != null && (
          <p className="mt-2 text-sm text-muted">기록 작품 평균 <span className="text-accent">★ {person.averageRating.toFixed(1)}</span></p>
        )}
      </header>

      {person.directed.length > 0 && (
        <section aria-labelledby="directed-films-title">
          <h2 id="directed-films-title" className="mb-4 text-lg font-bold">감독으로 본 전체 기록 ({person.directed.length})</h2>
          <FilmGrid films={person.directed} />
        </section>
      )}

      {actingOnly.length > 0 && (
        <section className={person.directed.length ? "mt-14" : ""} aria-labelledby="acted-films-title">
          <h2 id="acted-films-title" className="mb-4 text-lg font-bold">출연작 기록 ({actingOnly.length})</h2>
          <FilmGrid films={actingOnly} />
        </section>
      )}

      <Link href="/people" className="mt-12 inline-block text-sm text-muted hover:text-accent">← 전체 인물</Link>
    </>
  );
}
