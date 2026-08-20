import { getAllSongsRuntime } from "../../lib/songs";
import CarouselStudio from "./studio";

export const metadata = {
  title: "캐러셀 실험실 — Lyra",
  description: "앨범 커버 한 장과 가사 세 장으로 구성한 Instagram 캐러셀 프로토타입",
};

const flattenLyrics = (song) =>
  song.stanzas.flatMap((stanza, stanzaIndex) =>
    stanza.lines
      .filter((line) => line.en?.trim())
      .map((line, lineIndex) => ({
        en: line.en,
        ko: line.ko || "",
        reading: line.reading || "",
        stanza: stanzaIndex,
        section: lineIndex === 0 ? stanza.section || "" : "",
      }))
  );

export default async function CarouselLabPage() {
  const songs = (await getAllSongsRuntime())
    .map((song) => ({
      slug: song.slug,
      title: song.title,
      title_ko: song.title_ko || "",
      artist: song.artist,
      artist_ko: song.artist_ko || "",
      album: song.album || "",
      year: song.year || "",
      genre: song.genre || "",
      emotion: song.emotion || "",
      artwork: song.artwork || "",
      comment: song.comment || song.source_note || "",
      lines: flattenLyrics(song),
    }))
    .filter((song) => {
      const stanzaSizes = new Map();
      song.lines.forEach((line) => stanzaSizes.set(line.stanza, (stanzaSizes.get(line.stanza) || 0) + 1));
      const cardSizedStanzas = [...stanzaSizes.values()].filter((size) => size > 0 && size <= 5).length;
      return song.artwork.startsWith("https://") && song.comment && song.lines.length >= 6 && cardSizedStanzas >= 2;
    })
    .slice(0, 12);

  return <CarouselStudio songs={songs} />;
}
