import Link from "next/link";
import { getAllPeopleRuntime } from "../../lib/people";

export const metadata = {
  title: "인물 | Syno.",
  description: "기록한 영화와 드라마의 감독·배우",
};

export default async function PeoplePage() {
  const people = await getAllPeopleRuntime();
  // 데이터셋까지 합치면 인물이 수천 명 — 여러 편 겹치는 사람만 인덱스에 낸다.
  // (개별 인물 페이지는 검색·작품 링크로 여전히 닿는다)
  const directors = people.filter((person) => person.directedCount >= 2);
  const actors = people.filter((person) => person.actedCount >= 3);

  return (
    <>
      <header className="mb-10">
        <h1 className="text-2xl font-bold">인물</h1>
        <p className="mt-1 text-sm text-muted">여러 작품에서 만난 감독과 배우</p>
      </header>
      <PeopleSection title={`감독 (${directors.length})`} people={directors} />
      <PeopleSection title={`배우 (${actors.length})`} people={actors} />
    </>
  );
}

function PeopleSection({ title, people }) {
  return (
    <section className="mb-14">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="divide-y divide-line border-y border-line sm:grid sm:grid-cols-2 sm:divide-y-0">
        {people.map((person) => (
          <Link
            key={person.name}
            href={`/people/${encodeURIComponent(person.name)}`}
            className="flex items-center justify-between gap-3 border-b border-line py-3 pr-3 hover:text-accent sm:odd:mr-5"
          >
            <span className="truncate text-sm font-medium">{person.name}</span>
            <span className="shrink-0 text-xs text-muted">{person.worksCount}편</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
