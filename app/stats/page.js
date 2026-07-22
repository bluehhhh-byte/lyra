import Link from "next/link";
import { getAllSongs } from "../../lib/songs";
import { getAllMovies } from "../../lib/movies";
import { pct, Bars } from "./charts";
import DrillSection from "./drilldown";
import EmotionTimeline from "../emotion-timeline";
import { getDiary } from "../../lib/diary";

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

  // 일자별 감정 변화 — 상세(키워드·곡 목록)는 /diary로 옮기고, 통계에는
  // 시계열 곡선만 둔다
  const diary = getDiary();

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

      <section className="mb-12">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-muted">감정 변화</h2>
            <p className="mt-0.5 text-xs text-muted/70">기록한 날짜별 감정의 흐름</p>
          </div>
          <Link href="/diary" className="shrink-0 text-xs text-accent hover:underline">
            키워드 일기 자세히 →
          </Link>
        </div>
        <EmotionTimeline days={diary} />
      </section>

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

