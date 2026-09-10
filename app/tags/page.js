import Link from "next/link";
import { getAllSongsRuntime } from "../../lib/songs";
import { getAllMoviesRuntime } from "../../lib/movies";
import { COUNTRY_TAGS, GENRES } from "../../lib/genre";

// 112개가 한 덩어리로 늘어서 있으면 장르·연도·권역·무드가 뒤섞여 스캔이 안 된다.
// 유형은 코드가 이미 알고 있다 — GENRES와 COUNTRY_TAGS가 그 어휘고, 연도는
// 모양으로 판별된다. 새 분류 데이터를 만들지 않고 있는 것으로 나눈다.
const GENRE_SET = new Set(GENRES.map((g) => g.toLowerCase()));
const isYear = (tag) => /^\d{4}s?$/.test(tag);

// GENRES는 음악 어휘라 Drama·Comedy 같은 영화 장르를 모른다. 하드코딩한 목록을
// 하나 더 만드는 대신 기록된 영화의 genre 값을 그대로 모아 쓴다 — 데이터가
// 늘면 분류도 따라 는다.
const sectionsFor = (movieGenres) => [
  { key: "genre", title: "장르", hint: "음악과 영화의 갈래", match: (tag) => GENRE_SET.has(tag.toLowerCase()) || movieGenres.has(tag) },
  { key: "country", title: "권역", hint: "만들어진 곳", match: (tag) => COUNTRY_TAGS.includes(tag) },
  { key: "year", title: "연대", hint: "발표된 때", match: isYear },
  { key: "etc", title: "그 밖의 결", hint: "위 갈래에 들지 않는 말들", match: () => true },
];

export const metadata = { title: "태그 | Lyra", description: "태그로 둘러보는 가사·영화 컬렉션" };

export default async function TagsPage() {
  // one index over both collections — a year tag like 2004 counts the song AND
  // the film, and clicking it lands on the combined /tags/<tag> page
  const [songs, movies] = await Promise.all([getAllSongsRuntime(), getAllMoviesRuntime()]);
  const counts = new Map();
  for (const list of [songs, movies])
    for (const item of list)
      for (const t of item.tags) counts.set(t, (counts.get(t) || 0) + 1);

  // biggest tags first so the collection's shape is visible at a glance
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = tags[0]?.[1] || 1;

  // 먼저 맞는 유형 하나에만 들어간다 — 같은 태그가 두 절에 나오면 개수가 거짓이 된다.
  // 연대는 옛것부터 읽는 편이 자연스럽고, 나머지는 많이 쓴 순서 그대로.
  const movieGenres = new Set(movies.map((movie) => movie.genre).filter(Boolean));
  const grouped = sectionsFor(movieGenres).map((section) => ({ ...section, rows: [] }));
  for (const entry of tags) {
    grouped.find((section) => section.match(entry[0])).rows.push(entry);
  }
  const yearSection = grouped.find((section) => section.key === "year");
  yearSection.rows.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  const visible = grouped.filter((section) => section.rows.length > 0);

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">태그</h1>
      <p className="mb-8 text-sm text-muted">
        {tags.length}개 태그 · {songs.length}곡 · {movies.length}편
      </p>
      {visible.map(({ key, title, hint, rows }) => (
        <section key={key} className="mb-9" aria-labelledby={`tag-section-${key}`}>
          <div className="mb-3 flex items-baseline gap-2">
            <h2 id={`tag-section-${key}`} className="text-lg font-bold">{title}</h2>
            <p className="text-xs text-muted">{hint} · {rows.length}개</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {rows.map(([tag, n]) => (
              <Link
                key={tag}
                href={`/tags/${encodeURIComponent(tag)}`}
                // scale the type with usage — a tag on 8 songs should read bigger than one on 1
                className={` border border-line bg-surface px-3.5 py-1.5 transition hover:border-accent hover:text-accent ${
                  n / max > 0.66 ? "text-base" : n / max > 0.33 ? "text-sm" : "text-xs"
                }`}
              >
                {tag}
                <span className="ml-1.5 text-xs text-muted">{n}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {tags.length === 0 && <p className="py-20 text-center text-sm text-muted">아직 태그가 없습니다.</p>}
    </>
  );
}
