import { getAllSongs } from "./songs";
import { parseEmotion, emotionValence } from "./keywords";

// Group songs by the day they were recorded and describe each day's mood.
// Shared by the stats time-series and the full /diary page so the two never
// disagree. Songs only — emotion/keywords are a lyric feature; movies have none.
//
// Each day: the songs filed, a keyword frequency list, the dominant emotion
// (mode), and the mean valence (what the time-series plots — a day of one 슬픔
// and one 기쁨 averages to roughly neutral, which is the honest reading).

const tallyDesc = (values) => {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

export function getDiary() {
  const byDay = new Map();
  for (const s of getAllSongs()) {
    const day = (s.published || s.date || "").slice(0, 10);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(s);
  }

  return [...byDay.entries()]
    .map(([day, songs]) => {
      const emotions = songs.map((s) => parseEmotion(s.emotion)).filter(Boolean);
      const keywords = tallyDesc(songs.flatMap((s) => s.keywords || []));
      const valences = emotions.map(emotionValence);
      return {
        day,
        songs: songs.map((s) => ({
          slug: s.slug,
          title: s.title,
          artist: s.artist,
          artwork: s.artwork,
          emotion: parseEmotion(s.emotion),
          keywords: s.keywords || [],
        })),
        count: songs.length,
        keywords,
        emotions: tallyDesc(emotions),
        dominant: tallyDesc(emotions)[0]?.[0] || "",
        // mean valence of the day's emotions; null when no song that day carries one
        valence: valences.length ? valences.reduce((a, b) => a + b, 0) / valences.length : null,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day)); // chronological — the time-series wants oldest→newest
}
