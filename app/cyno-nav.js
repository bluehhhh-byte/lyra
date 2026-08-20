import Link from "next/link";
import { getAllMoviesRuntime } from "../lib/movies";
import { getWatchedRuntime } from "../lib/watched";

const tabs = [
  ["movies", "/movies", "기록한 영화"],
  ["watched", "/watched", "평가한 영화"],
];

export default async function CynoNav({ active }) {
  const [movies, watched] = await Promise.all([getAllMoviesRuntime(), getWatchedRuntime()]);
  const counts = { movies: movies.length, watched: watched.filter((movie) => movie.rating != null).length };
  return (
    <nav aria-label="Cyno 기록 종류" className="mb-6 flex flex-wrap items-center gap-1.5">
      {tabs.map(([key, href, label]) => (
        <Link key={key} href={href} className={`rounded-full border px-3 py-1 text-xs ${active === key ? "border-accent bg-accent font-semibold text-bg" : "border-line text-muted hover:text-accent"}`}>
          {label} <span className={active === key ? "opacity-70" : "text-muted/60"}>{counts[key]}</span>
        </Link>
      ))}
    </nav>
  );
}
