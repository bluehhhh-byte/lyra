import Link from "next/link";
import { getAllSongs } from "../../lib/songs";
import { getAllMovies } from "../../lib/movies";
import { pct, Bars } from "./charts";
import DrillSection from "./drilldown";

export const metadata = {
  title: "컬렉션 통계 | Lyra",
  description: "모아둔 곡들의 국가·연대·태그 분포",
};

const COUNTRY = { ko: "한국", ja: "일본", en: "영미" };
const isDecadeTag = (t) => /^\d{4}s?$/.test(t); // 2010s (legacy) or 2018 (exact year)
const isCountryTag = (t) => Object.values(COUNTRY).includes(t) || t === "기타";
// movies use real nationalities (미국·영국·프랑스…), not the song 영미 bucket
const MOVIE_COUNTRIES = ["한국", "일본", "미국", "영국", "프랑스", "홍콩", "중국", "대만", "기타"];
const isMovieCountryTag = (t) => MOVIE_COUNTRIES.includes(t);

// Map<key, count>, biggest first
function tally(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// half-star aware ★ row clipped to the score
function Stars({ value }) {
  return (
    <span className="relative inline-block align-middle text-sm leading-none" aria-label={`별점 ${value}/5`}>
      <span className="text-muted/30">★★★★★</span>
      <span className="absolute inset-0 overflow-hidden text-accent" style={{ width: `${(value / 5) * 100}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

export default function StatsPage() {
  const songs = getAllSongs();
  const movies = getAllMovies();

  // movie stats: count, mean rating, rating distribution (5.0 → 0.5), country/genre
  const rated = movies.filter((m) => m.rating != null);
  const meanRating = rated.length
    ? (rated.reduce((n, m) => n + m.rating, 0) / rated.length).toFixed(1)
    : null;
  const ratingRows = [];
  for (let r = 5; r >= 0.5; r -= 0.5) {
    const n = rated.filter((m) => m.rating === r).length;
    if (n) ratingRows.push([`${r.toFixed(1)}★`, n]);
  }
  const movieCountry = tally(movies.map((m) => m.tags.find((t) => isMovieCountryTag(t)) || "기타"));
  const movieGenre = tally(
    movies.flatMap((m) => m.tags).filter((t) => !isDecadeTag(t) && !isMovieCountryTag(t))
  ).slice(0, 10);

  const lines = songs.flatMap((s) => s.stanzas.flatMap((st) => st.lines));
  const translated = lines.filter((l) => l.ko).length;
  const readings = lines.filter((l) => l.reading).length;
  const stanzas = songs.flatMap((s) => s.stanzas).length;

  // country follows the artist-nationality tag; lyric language is only a
  // fallback for songs saved before country tags existed
  const byCountry = tally(
    songs.map((s) => s.tags.find((t) => isCountryTag(t)) || COUNTRY[s.lang] || "기타")
  );
  const byDecade = tally(songs.filter((s) => s.year).map((s) => `${Math.floor(+s.year / 10) * 10}s`)).sort(
    (a, b) => a[0].localeCompare(b[0])
  );
  // per-exact-year — the drill-down under 연대별
  const byYear = tally(songs.filter((s) => s.year).map((s) => String(s.year))).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const byArtist = tally(songs.map((s) => s.artist)).slice(0, 8);
  // country/decade already have their own sections — what's left is genre + mood
  const byTagAll = tally(
    songs.flatMap((s) => s.tags).filter((t) => !isDecadeTag(t) && !isCountryTag(t))
  );
  const byTag = byTagAll.slice(0, 12);

  const untagged = songs.filter((s) => s.tags.length === 0).length;

  // when entries were recorded — published (full timestamp) first, date as fallback.
  // Everything is bucketed in KST, since that's when the writing actually happened.
  const kst = (s) => {
    const v = s.published || s.date;
    if (!v) return null;
    const d = new Date(v.length <= 10 ? `${v}T12:00:00+09:00` : v);
    return isNaN(d) ? null : new Date(d.getTime() + 9 * 3600 * 1000); // shift, read via getUTC*
  };
  const stamps = songs.map(kst).filter(Boolean);
  const byMonth = tally(stamps.map((d) => `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}`)).sort(
    (a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })
  );
  const HOURS = [
    ["새벽 0–6시", 0],
    ["아침 6–12시", 6],
    ["오후 12–18시", 12],
    ["밤 18–24시", 18],
  ];
  const withTime = songs.filter((s) => (s.published || "").length > 10).map(kst).filter(Boolean);
  const byHour = HOURS.map(([label, from]) => [
    label,
    withTime.filter((d) => d.getUTCHours() >= from && d.getUTCHours() < from + 6).length,
  ]);

  // ── 키워드 일기: 기록한 날짜별로 그날의 키워드와 지배 감정을 묶는다.
  // 같은 날 여러 곡을 기록하면 그날의 감정은 최빈값 — 7/20이 슬픔이었고
  // 7/21이 분노였는지를 나중에 되짚을 수 있게.
  const diaryDays = (() => {
    const byDay = new Map();
    for (const s of songs) {
      const day = (s.published || s.date || "").slice(0, 10);
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(s);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0])) // newest day first
      .map(([day, list]) => {
        const kw = tally(list.flatMap((s) => s.keywords || []));
        const emotions = tally(list.map((s) => s.emotion).filter(Boolean));
        return { day, count: list.length, keywords: kw, emotion: emotions[0]?.[0] || "" };
      })
      .filter((d) => d.keywords.length || d.emotion); // 소급 전의 빈 날은 표시하지 않는다
  })();

  if (songs.length === 0) {
    return <p className="py-20 text-center text-sm text-muted">아직 곡이 없습니다.</p>;
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">컬렉션 통계</h1>
      <p className="mb-10 text-sm text-muted">
        {songs.length}곡 · {new Set(songs.map((s) => s.artist)).size}명의 가수
      </p>

      <div className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="곡" value={songs.length} />
        <Stat label="가사 줄" value={lines.length} />
        <Stat label="번역된 줄" value={translated} sub={pct(translated, lines.length)} />
        <Stat label="연" value={stanzas} />
      </div>

      {diaryDays.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-1 text-sm font-semibold text-muted">키워드 일기</h2>
          <p className="mb-4 text-xs text-muted/70">
            그날 기록한 곡들의 가사 키워드와 감정 — 날짜별 마음의 기록
          </p>
          <ol className="space-y-4 border-l border-line pl-4">
            {diaryDays.map((d) => (
              <li key={d.day} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-accent" />
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold tabular-nums">
                    {d.day.slice(5).replace("-", "/")}
                  </span>
                  {d.emotion && (
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-bg">
                      {d.emotion}
                    </span>
                  )}
                  <span className="text-xs text-muted">{d.count}곡</span>
                </div>
                {d.keywords.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.keywords.map(([w, n]) => (
                      <Link
                        key={w}
                        href={`/?q=${encodeURIComponent(w)}`}
                        className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
                      >
                        #{w}
                        {n > 1 && <span className="ml-1 opacity-60">{n}</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-12 sm:grid-cols-2">
        <Section title="국가별" href="/?group=country">
          <Bars data={byCountry} total={songs.length} />
        </Section>

        <DrillSection
          title="연대별"
          coarse={byDecade}
          fine={byYear}
          fineLabel="연도별 보기"
          total={songs.length}
        />

        <Section title="가수별" href="/?group=artist">
          <Bars data={byArtist} total={songs.length} />
        </Section>

        <DrillSection
          title="태그"
          coarse={byTag}
          fine={byTagAll}
          fineLabel="전체 보기"
          total={songs.length}
          linkPrefix="/tags/"
        />

        <Section title="월별 기록">
          <Bars data={byMonth} total={stamps.length} />
        </Section>

        <Section title="기록 시간대">
          {withTime.length ? (
            <Bars data={byHour} total={withTime.length} />
          ) : (
            <p className="text-sm text-muted">시각이 기록된 곡이 아직 없습니다.</p>
          )}
        </Section>
      </div>

      {(readings > 0 || untagged > 0) && (
        <p className="mt-14 text-xs text-muted">
          {readings > 0 && `한글 독음이 달린 줄 ${readings}개. `}
          {untagged > 0 && `태그가 비어 있는 곡 ${untagged}개.`}
        </p>
      )}

      {movies.length > 0 && (
        <div className="mt-20 border-t border-line pt-12">
          <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold">
            영화
            <Link href="/movies" className="text-xs font-normal text-muted hover:text-accent">
              보기 →
            </Link>
          </h2>
          <p className="mb-10 text-sm text-muted">
            {movies.length}편
            {meanRating && (
              <>
                {" · 평균 "}
                <Stars value={Number(meanRating)} />
                <span className="ml-1 text-accent">{meanRating}</span>
              </>
            )}
          </p>

          <div className="grid gap-12 sm:grid-cols-2">
            {ratingRows.length > 0 && (
              <Section title="별점 분포">
                <Bars data={ratingRows} total={rated.length} />
              </Section>
            )}
            <Section title="국가별">
              <Bars data={movieCountry} total={movies.length} />
            </Section>
            {movieGenre.length > 0 && (
              <Section title="장르">
                <Bars data={movieGenre} total={movies.length} />
              </Section>
            )}
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← 컬렉션으로
        </Link>
        <div className="flex gap-4">
          <a href="/api/export/stats" download className="text-sm text-muted hover:text-accent">
            통계 .md 다운로드 ↓
          </a>
          <a href="/api/export" download className="text-sm text-muted hover:text-accent">
            전체 가사 .md 다운로드 ↓
          </a>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs text-muted">
        {label}
        {sub && <span className="ml-1 text-accent">{sub}</span>}
      </p>
    </div>
  );
}

function Section({ title, href, children }) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold">
        {title}
        {href && (
          <Link href={href} className="ml-2 text-xs font-normal text-muted hover:text-accent">
            보기 →
          </Link>
        )}
      </h2>
      {children}
    </section>
  );
}

