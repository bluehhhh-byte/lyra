import { handleSongs } from "./songs";
import { handleMovies } from "./movies";
import { handleWatcha } from "./watcha";
import { handleMoments } from "./moments";

// per-request work is one song's lyric lookup (native chain hits iTunes+lrclib
// a few times); 30s is ample and stays within hobby-plan limits.
// Vercel hobby 상한. Gemini(대형 프롬프트 + 재시도 백오프) + TMDB 검색이
// 30초를 넘겨 FUNCTION_INVOCATION_TIMEOUT이 났다 — 60으로 올린다.
export const maxDuration = 60;

// Auth is enforced by middleware.js (password cookie). Writes go through
// lib/store — fs locally, Neon in production, GitHub as a migration fallback. Actions are split by
// domain into ./songs, ./movies, ./watcha; each handler returns a Response
// for an action it owns, or null so the next handler gets a turn.
export async function POST(req) {
  try {
    return await handle(req);
  } catch (e) {
    // always return JSON so the client never hits an empty-body parse error
    return Response.json({ error: e.message || "서버 오류" }, { status: 500 });
  }
}

async function handle(req) {
  const { action, ...body } = await req.json();
  return (
    (await handleMoments(action, body)) ??
    (await handleMovies(action, body)) ??
    (await handleWatcha(action, body)) ??
    (await handleSongs(action, body)) ??
    Response.json({ error: "unknown action" }, { status: 400 })
  );
}
