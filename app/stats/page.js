import Link from "next/link";
import { getAllSongs } from "../../lib/songs";

export const metadata = {
  title: "컬렉션 통계 | Lyra",
  description: "모아둔 곡들의 국가·연대·태그 분포",
};

const COUNTRY = { ko: "한국", ja: "일본", en: "영미" };
const isDecadeTag = (t) => /^\d{4}s$/.test(t);
const isCountryTag = (t) => Object.values(COUNTRY).includes(t) || t === "기타";

// Map<key, count>, biggest first
function tally(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export default function StatsPage() {
  const songs = getAllSongs();

  const lines = songs.flatMap((s) => s.stanzas.flatMap((st) => st.lines));
  const translated = lines.filter((l) => l.ko).length;
  const readings = lines.filter((l) => l.reading).length;
  const notes = songs.flatMap((s) => s.stanzas).filter((st) => st.note).length;

  const byCountry = tally(songs.map((s) => COUNTRY[s.lang] || "기타"));
  const byDecade = tally(songs.filter((s) => s.year).map((s) => `${Math.floor(+s.year / 10) * 10}s`)).sort(
    (a, b) => a[0].localeCompare(b[0])
  );
  const byArtist = tally(songs.map((s) => s.artist)).slice(0, 8);
  // country/decade already have their own sections — what's left is genre + mood
  const byTag = tally(
    songs.flatMap((s) => s.tags).filter((t) => !isDecadeTag(t) && !isCountryTag(t))
  ).slice(0, 12);

  const untagged = songs.filter((s) => s.tags.length === 0).length;

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
        <Stat label="해설 노트" value={notes} />
      </div>

      <div className="grid gap-12 sm:grid-cols-2">
        <Section title="국가별" href="/?group=country">
          <Bars data={byCountry} total={songs.length} />
        </Section>

        <Section title="연대별" href="/?group=decade">
          <Bars data={byDecade} total={songs.length} />
        </Section>

        <Section title="가수별" href="/?group=artist">
          <Bars data={byArtist} total={songs.length} />
        </Section>

        <Section title="태그">
          {byTag.length ? (
            <Bars data={byTag} total={songs.length} link={(t) => `/?tag=${encodeURIComponent(t)}`} />
          ) : (
            <p className="text-sm text-muted">아직 태그가 없습니다.</p>
          )}
        </Section>
      </div>

      {(readings > 0 || untagged > 0) && (
        <p className="mt-14 text-xs text-muted">
          {readings > 0 && `한글 독음이 달린 줄 ${readings}개. `}
          {untagged > 0 && `태그가 비어 있는 곡 ${untagged}개.`}
        </p>
      )}

      <div className="mt-10">
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← 컬렉션으로
        </Link>
      </div>
    </>
  );
}

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "—");

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

function Bars({ data, total, link }) {
  const max = Math.max(...data.map(([, n]) => n), 1);
  return (
    <ul className="space-y-2">
      {data.map(([label, n]) => {
        const row = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">{label}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {n} <span className="opacity-60">{pct(n, total)}</span>
              </span>
            </div>
            {/* width is the only dynamic bit — inline style beats 100 arbitrary classes */}
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
            </div>
          </>
        );
        return (
          <li key={label}>
            {link ? (
              <Link href={link(label)} className="block hover:opacity-80">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
