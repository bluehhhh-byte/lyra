import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// 검색은 빌드 때 만들어 둔 data/search-index.json만 읽는다 (scripts/build-search-index.mjs).
// 예전에는 요청마다 곡 md 800개와 왓챠 1045편을 다시 파싱했다 — 같은 답을 얻는 데
// 매번 1MB 넘게 다시 읽는 셈이었다. 인덱스가 없으면(로컬에서 빌드 전) 그 자리에서 만든다.
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  const file = path.join(process.cwd(), "data", "search-index.json");
  try {
    INDEX = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    INDEX = { songs: [], movies: [], watched: [], people: [] };
  }
  return INDEX;
}

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
  const db = index();

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
    ].filter(([, items]) => items.length),
  });
}
