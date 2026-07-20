import { getAllSongs } from "../lib/songs";
import Browse from "./browse";

const COUNTRY = { ko: "한국", ja: "일본", en: "영미" };
const COUNTRY_TAGS = ["한국", "일본", "영미", "기타"];
// the country tag tracks the artist's nationality; lyric language is only a
// fallback for songs saved before country tags existed
const countryOf = (s) => s.tags.find((t) => COUNTRY_TAGS.includes(t)) || COUNTRY[s.lang] || "기타";

export default async function Home({ searchParams }) {
  const { tag, q, group } = (await searchParams) || {};
  const songs = getAllSongs().map((s) => ({
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
    // meta and lyrics are searched separately so a lyric-only match can show
    // WHICH line matched (snippet under the result card)
    metaSearch: [s.title, s.title_ko, s.artist, s.artist_ko, s.album, s.tags.join(" ")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    // ponytail: ships every song's full lyrics to the client. ~20 songs = a few KB.
    // Move search to a route handler (or a prebuilt index) past ~100 songs.
    lines: s.stanzas.flatMap((st) => st.lines.flatMap((l) => [l.en, l.ko])).filter(Boolean),
  }));

  return <Browse songs={songs} initialTag={tag || ""} initialQ={q || ""} initialGroup={group || "none"} />;
}
