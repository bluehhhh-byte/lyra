import { getAllSongs } from "../lib/songs";
import Browse from "./browse";

const COUNTRY = { ko: "한국", ja: "일본", en: "영미" };
const COUNTRY_TAGS = ["한국", "일본", "영미", "기타"];
// the country tag tracks the artist's nationality; lyric language is only a
// fallback for songs saved before country tags existed
const countryOf = (s) => s.tags.find((t) => COUNTRY_TAGS.includes(t)) || COUNTRY[s.lang] || "기타";

// one pull-quote per song for the "오늘의 가사" card — a noted stanza first
// (the owner marked it as meaningful), else the first short translated stanza
function quoteOf(s) {
  const cands = s.stanzas.filter(
    (st) => st.lines.length > 0 && st.lines.length <= 4 && st.lines.some((l) => l.ko)
  );
  const st = cands.find((c) => c.note) || cands[0];
  if (!st) return null;
  return {
    slug: s.slug,
    title: s.title,
    artist: s.artist,
    lines: st.lines.slice(0, 2).map((l) => ({ en: l.en, ko: l.ko })),
  };
}

export default async function Home({ searchParams }) {
  const { tag, q, group } = (await searchParams) || {};
  const all = getAllSongs();
  const quotes = all.map(quoteOf).filter(Boolean);
  const songs = all.map((s) => ({
    slug: s.slug,
    title: s.title,
    title_ko: s.title_ko || "",
    artist: s.artist,
    artist_ko: s.artist_ko || "",
    year: s.year || "",
    artwork: s.artwork,
    tags: s.tags,
    country: countryOf(s),
    decade: s.year ? `${Math.floor(+s.year / 10) * 10}s` : "미상",
    // compact lowercase blob for client search (title/artist/album/tags/lyrics)
    // ponytail: ships every song's full lyrics to the client. 11 songs = a few KB.
    // Move search to a route handler (or a prebuilt index) past ~100 songs.
    search: [
      s.title,
      s.title_ko,
      s.artist,
      s.artist_ko,
      s.album,
      s.tags.join(" "),
      ...s.stanzas.flatMap((st) => st.lines.flatMap((l) => [l.en, l.ko])),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  }));

  return (
    <Browse
      songs={songs}
      quotes={quotes}
      initialTag={tag || ""}
      initialQ={q || ""}
      initialGroup={group || "none"}
    />
  );
}
