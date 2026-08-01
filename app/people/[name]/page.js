import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPeople, getPerson } from "../../../lib/people";

export function generateStaticParams() {
  // 정적 내보내기는 경로마다 파일을 만든다 — 이름에 " : * ? < > | 가 있으면
  // Windows에서 파일 생성이 실패해 빌드가 통째로 멈춘다(예: Francisco "Viruta" Durán).
  // 그런 이름은 미리 굽지 않고 요청 시 렌더한다.
  return getAllPeople()
    .filter((person) => !/["*:<>?|\\]/.test(person.name))
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
        {person.works.map((movie) => (
          <Link key={movie.slug} href={`/movies/${movie.slug}`} className="group">
            <img src={movie.poster} alt="" className="aspect-[2/3] w-full rounded border border-line object-cover" />
            <h2 className="mt-2 truncate text-sm font-semibold group-hover:text-accent">{movie.title_ko || movie.title}</h2>
            <p className="mt-0.5 truncate text-xs text-muted">
              {movie.year}{movie.rating != null ? ` · ★ ${movie.rating}` : ""}
            </p>
          </Link>
        ))}
      </div>

      <Link href="/people" className="mt-12 inline-block text-sm text-muted hover:text-accent">← 전체 인물</Link>
    </>
  );
}
