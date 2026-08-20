import { currentSearchIndex } from "../../../lib/search-index";

export const dynamic = "force-dynamic";

const LIMIT = 6;
const pick = (items, query) => {
  const out = [];
  for (const it of items) {
    if (!it.meta.includes(query)) continue;
    out.push({ href: it.href, title: it.title, subtitle: it.subtitle, image: it.image });
    if (out.length === LIMIT) break;
  }
  return out;
};

export async function GET(request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
  if (!query) return Response.json({ groups: [] });
  const db = await currentSearchIndex();

  // 곡만 가사까지 본다 — 맞은 줄을 스니펫으로 보여주기 위해서다
  const songs = [];
  for (const s of db.songs) {
    const lyric = s.meta.includes(query)
      ? s.lines.find((l) => l.toLowerCase().includes(query)) || ""
      : s.lines.find((l) => l.toLowerCase().includes(query));
    if (!s.meta.includes(query) && !lyric) continue;
    songs.push({ href: s.href, title: s.title, subtitle: s.subtitle, image: s.image, snippet: lyric || "" });
    if (songs.length === LIMIT) break;
  }

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
