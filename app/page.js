import { getAllSongs } from "../lib/songs";
import Browse from "./browse";

const COUNTRY = { ko: "한국", ja: "일본", en: "영미" };

export default function Home() {
  const songs = getAllSongs().map((s) => ({
    slug: s.slug,
    title: s.title,
    title_ko: s.title_ko || "",
    artist: s.artist,
    artist_ko: s.artist_ko || "",
    year: s.year || "",
    artwork: s.artwork,
    tags: s.tags,
    country: COUNTRY[s.lang] || "기타",
    decade: s.year ? `${Math.floor(+s.year / 10) * 10}s` : "미상",
    // compact lowercase blob for client search (title/artist/album/tags/lyrics)
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

  return <Browse songs={songs} />;
}
