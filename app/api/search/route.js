import { currentSearchIndex } from "../../../lib/search-index";
import { rankedSearch, searchScore } from "../../../lib/search-rank";

export const dynamic = "force-dynamic";

const LIMIT = 6;
const pick = (items, query) => rankedSearch(items, query, LIMIT).map(({ href, title, subtitle, image }) => ({ href, title, subtitle, image }));

export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
  if (!query) return Response.json({ groups: [] });
  const db = await currentSearchIndex();

  // 곡만 가사까지 본다 — 맞은 줄을 스니펫으로 보여주기 위해서다
  const songs = db.songs
    .map((song, index) => {
      const lyric = song.lines.find((line) => line.toLowerCase().includes(query)) || "";
      const score = searchScore(song, query) + (lyric ? 3 : 0);
      return { song, lyric, score, index };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, LIMIT)
    .map(({ song, lyric }) => ({ href: song.href, title: song.title, subtitle: song.subtitle, image: song.image, snippet: lyric }));

  return Response.json({
    groups: [
      ["음악", songs],
      ["영화·드라마", pick(db.movies, query)],
      ["평가한 영화", pick(db.watched, query)],
      ["인물", pick(db.people, query)],
      ["문화 장면", pick(db.moments, query)],
    ].filter(([, items]) => items.length),
  });
}
