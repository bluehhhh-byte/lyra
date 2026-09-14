import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonRuntime } from "../../../lib/people";
import CoverImage from "../../cover-image";

// 이 줄이 없어서 이 라우트만 ƒ(요청마다 새로 렌더)였다. 인물은 2,545명이고
// robots.txt를 무시하는 크롤러가 계속 훑는데, 한 명을 보여 주려고 영화 전집과
// Watcha 기록을 읽는다 — 캐시가 없으니 그 읽기가 매번 일어났다. 곡·영화·아카이브는
// 모두 이 두 줄을 갖고 있고, 여기만 빠져 있었다.
//
export const revalidate = 21600;
export const dynamicParams = true;

// 빈 배열이다 — 빌드에서는 한 장도 굽지 않는다(2,545장을 구우면 빌드가 전집을
// 다시 읽는다). 그런데 이 함수가 있어야 Next가 이 라우트를 ISR로 다룬다.
// revalidate만 붙이면 ƒ로 남아 요청마다 새로 렌더한다 — 빌드 출력에서 확인했다.
// 처음 열린 인물만 한 번 굽고, 그 뒤 6시간은 재사용한다.
export async function generateStaticParams() {
  return [];
}

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
        <h1 className="text-3xl font-bold sm:text-4xl">{person.name}</h1>
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
