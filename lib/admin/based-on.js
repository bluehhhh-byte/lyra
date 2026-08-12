// 추천 근거(basedOn) 검증 — Gemini의 근거가 실제 데이터와 어긋나면 버린다.
// 곡은 컬렉션에 진짜 있는 것만(slug 매핑), 장르·감정은 닫힌 어휘만.
// 순수 함수 — based-on.test.mjs가 회귀를 지킨다.
import { normText } from "./itunes.js";
import { GENRES, capGenre } from "../genre.js";
import { parseEmotion } from "../keywords.js";

// songs 배열로 검증기를 만든다. "제목 - 아티스트" 정확 일치가 우선이고,
// 제목만 일치하는 fallback은 그 제목이 컬렉션에서 유일할 때만 허용 —
// 동명곡이 생기면 오연결하느니 근거를 버린다.
export function makeBasedOnCleaner(songs) {
  const byFull = new Map(songs.map((s) => [normText(`${s.title} - ${s.artist}`), s]));
  const titleCount = new Map();
  for (const s of songs) {
    const k = normText(s.title);
    titleCount.set(k, (titleCount.get(k) || 0) + 1);
  }
  const byUniqueTitle = new Map(
    songs.filter((s) => titleCount.get(normText(s.title)) === 1).map((s) => [normText(s.title), s])
  );

  return function cleanBasedOn(b) {
    if (!b) return null;
    if (typeof b === "string") return { songs: [], genres: [], emotions: [], reason: b.slice(0, 60) };
    const srcSongs = (Array.isArray(b.songs) ? b.songs : [])
      .map((x) => {
        const raw = String(x);
        const hit = byFull.get(normText(raw)) || byUniqueTitle.get(normText(raw.split(" - ")[0]));
        return hit ? { slug: hit.slug, title: hit.title } : null;
      })
      .filter(Boolean)
      .slice(0, 2);
    return {
      songs: srcSongs,
      genres: (Array.isArray(b.genres) ? b.genres : []).map(capGenre).filter((g) => GENRES.includes(g)).slice(0, 2),
      emotions: (Array.isArray(b.emotions) ? b.emotions : []).map(parseEmotion).filter(Boolean).slice(0, 2),
      reason: String(b.reason || "").trim().slice(0, 60),
    };
  };
}
