import Link from "next/link";
import { getAllMoviesRuntime } from "../lib/movies";
import { getWatchedRuntime } from "../lib/watched";

// Syno에는 성격이 다른 기록이 둘 있다.
//   감상 기록  movies/*.md — 줄거리·감상을 직접 쓴 작품
//   별점 평가  data/watcha-movies.json — 왓챠에서 별점만 매긴 목록
// 예전에는 별점 쪽 링크가 햄버거 메뉴 안에만 있어서, 첫 화면만 보면 1,045편이
// 통째로 사라진 것처럼 보였다. 두 기록을 나란히 놓고 편수를 함께 보여 준다.
//
// 편수만 세어 넘긴다 — 별점 1,045편의 목록을 /movies의 HTML에 같이 실으면
// 첫 화면이 그만큼 무거워진다. 목록은 각자의 페이지에서만 그린다.
export default async function SynoNav({ active }) {
  const [movies, watched] = await Promise.all([getAllMoviesRuntime(), getWatchedRuntime()]);
  const tabs = [
    { href: "/movies", label: "감상 기록", count: movies.length, key: "movies" },
    { href: "/watched", label: "별점 평가", count: watched.filter((m) => m.rating != null).length, key: "watched" },
  ];

  return (
    <nav aria-label="Syno 기록 종류" className="mb-6 flex flex-wrap items-center gap-1.5">
      {tabs.map(({ href, label, count, key }) => {
        const on = key === active;
        return (
          <Link
            key={key}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition active:scale-[0.97] ${
              on
                ? "border-accent bg-accent font-semibold text-bg"
                : "border-line text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {label}
            <span className={`tabular-nums ${on ? "text-bg/70" : "text-muted/70"}`}>
              {count.toLocaleString("ko-KR")}편
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
