import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPeople, getPerson } from "../../../lib/people";
import CoverImage from "../../cover-image";

export function generateStaticParams() {
  // 데이터셋까지 합치면 인물이 수천 명이라 전부 미리 구우면 빌드가 폭발한다.
  // 작품 3편 이상인 사람만 정적 생성하고 나머지는 요청 시 렌더(dynamicParams 기본 on).
  // 이름에 " : * ? < > | 가 있으면 Windows 파일 생성이 실패하므로 그것도 뺀다.
  return getAllPeople()
    .filter((person) => person.works.length >= 3 && !/["*:<>?|\\/]/.test(person.name))
    .map((person) => ({ name: person.name }));
}

export async function generateMetadata({ params }) {
  const person = getPerson(decodeURIComponent((await params).name));
  if (!person) return {};
  return { title: `${person.name} | Syno.` };
}

export default async function PersonPage({ params }) {
  const person = getPerson(decodeURIComponent((await params).name));
  if (!person) notFound();
  const roles = [
    person.directed.length && `감독 ${person.directed.length}편`,
    person.acted.length && `출연 ${person.acted.length}편`,
  ].filter(Boolean);

  return (
    <>
      <header className="mb-10">
        <p className="mb-1 text-xs text-muted">{roles.join(" · ")}</p>
        <h1 className="text-3xl font-bold">{person.name}</h1>
        {person.averageRating != null && (
          <p className="mt-2 text-sm text-muted">기록 작품 평균 <span className="text-accent">★ {person.averageRating.toFixed(1)}</span></p>
        )}
      </header>

      <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-5">
        {person.works.map((movie) => {
          // 내부 페이지(/movies)면 Link, 데이터셋 영화면 TMDB 외부 링크, 없으면 링크 없음
          const inner = movie.href?.startsWith("/");
          const Card = (
            <>
              <CoverImage src={movie.poster} alt="" label={movie.title_ko || movie.title} className="aspect-[2/3] w-full rounded border border-line object-cover" />
              <h2 className="mt-2 truncate text-sm font-semibold group-hover:text-accent">{movie.title_ko || movie.title}</h2>
              <p className="mt-0.5 truncate text-xs text-muted">
                {movie.year}{movie.rating != null ? ` · ★ ${movie.rating}` : ""}
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

      <Link href="/people" className="mt-12 inline-block text-sm text-muted hover:text-accent">← 전체 인물</Link>
    </>
  );
}
