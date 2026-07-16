import { getAllSongs } from "../../../../lib/songs";

// The collection stats as one Markdown file — mirrors the /stats page's
// categories. Prerendered at build time (songs are only guaranteed on disk
// then; every save redeploys, so it stays current).
export const dynamic = "force-static";

const COUNTRY = { ko: "한국", ja: "일본", en: "영미" };
const isDecadeTag = (t) => /^\d{4}s?$/.test(t);
const isCountryTag = (t) => Object.values(COUNTRY).includes(t) || t === "기타";
const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "—");

function tally(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// a tally → a Markdown table
function table(rows, total, head = "항목") {
  if (!rows.length) return "_데이터 없음_\n";
  return (
    `| ${head} | 곡 | 비율 |\n| --- | ---: | ---: |\n` +
    rows.map(([label, n]) => `| ${label} | ${n} | ${pct(n, total)} |`).join("\n") +
    "\n"
  );
}

export async function GET() {
  const songs = getAllSongs();
  const lines = songs.flatMap((s) => s.stanzas.flatMap((st) => st.lines));
  const translated = lines.filter((l) => l.ko).length;
  const readings = lines.filter((l) => l.reading).length;
  const stanzas = songs.flatMap((s) => s.stanzas).length;
  const artists = new Set(songs.map((s) => s.artist)).size;

  const byCountry = tally(
    songs.map((s) => s.tags.find((t) => isCountryTag(t)) || COUNTRY[s.lang] || "기타")
  );
  const byDecade = tally(songs.filter((s) => s.year).map((s) => `${Math.floor(+s.year / 10) * 10}s`)).sort(
    (a, b) => a[0].localeCompare(b[0])
  );
  const byYear = tally(songs.filter((s) => s.year).map((s) => String(s.year))).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const byTag = tally(
    songs.flatMap((s) => s.tags).filter((t) => !isDecadeTag(t) && !isCountryTag(t))
  );
  const byArtist = tally(songs.map((s) => s.artist));

  const today = new Date().toISOString().slice(0, 10);
  const md = `# Lyra 컬렉션 통계

_${songs.length}곡 · ${artists}명의 가수 · ${today} 기준_

## 요약

| 지표 | 값 |
| --- | ---: |
| 곡 | ${songs.length} |
| 가사 줄 | ${lines.length} |
| 번역된 줄 | ${translated} (${pct(translated, lines.length)}) |
| 연 | ${stanzas} |
| 한글 독음 줄 | ${readings} |

## 국가별

${table(byCountry, songs.length, "국가")}
## 연대별

${table(byDecade, songs.length, "연대")}
## 연도별

${table(byYear, songs.length, "연도")}
## 장르·태그

${table(byTag, songs.length, "태그")}
## 가수별

${table(byArtist, songs.length, "가수")}`;

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lyra-stats.md"',
    },
  });
}
