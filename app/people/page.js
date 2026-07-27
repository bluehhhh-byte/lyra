import Link from "next/link";
import { getAllPeople } from "../../lib/people";

export const metadata = {
  title: "인물 | Syno.",
  description: "기록한 영화와 드라마의 감독·배우",
};

export default function PeoplePage() {
  const people = getAllPeople();
  const directors = people.filter((person) => person.directed.length);
  const actors = people.filter((person) => person.acted.length);

  return (
    <>
      <header className="mb-10">
        <h1 className="text-2xl font-bold">인물</h1>
        <p className="mt-1 text-sm text-muted">{people.length}명의 감독과 배우</p>
      </header>
      <PeopleSection title="감독" people={directors} />
      <PeopleSection title="배우" people={actors} />
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
            <span className="shrink-0 text-xs text-muted">{person.works.length}편</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
