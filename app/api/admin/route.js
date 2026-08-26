import { handleSongs } from "./songs";
import { handleMovies } from "./movies";
import { handleWatcha } from "./watcha";
import { handleMoments } from "./moments";
import { handlePublish } from "./publish";
import { lastGeminiError, withReason } from "../../../lib/admin/gemini";
import { sameOrigin, forbiddenOrigin } from "../../../lib/admin/same-origin";

// Gemini 호출 하나는 lib/admin/gemini.js가 48초 예산으로 스스로 묶지만, 한 액션이
// Gemini를 여러 번 부르는 경우가 있다(연 해설 regenNotes는 연마다 한 번씩). 그 합이
// 60초를 넘기면 Vercel이 함수를 강제 종료해 실패 이유조차 못 돌려준다. Fluid compute
// 기준 Hobby 상한(300초) 안에서 여유를 둔다 — 느려서 180초를 쓰라는 뜻이 아니라,
// 우리가 먼저 포기하고 이유를 남길 시간까지 플랫폼이 기다려 주게 하는 것이다.
export const maxDuration = 180;

// Auth is enforced by middleware.js (password cookie). Writes go through
// lib/store — fs locally, Neon in production, GitHub as a migration fallback. Actions are split by
// domain into ./songs, ./movies, ./watcha; each handler returns a Response
// for an action it owns, or null so the next handler gets a turn.
export async function POST(req) {
  try {
    if (!sameOrigin(req)) return forbiddenOrigin();
    return await withGeminiReason(await handle(req));
  } catch (e) {
    console.error("[api/admin] request failed", {
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    // always return JSON so the client never hits an empty-body parse error
    return Response.json({ error: e instanceof Error ? e.message : "서버 오류" }, { status: 500 });
  }
}

// 502는 전부 "AI가 답을 못 줬다"는 뜻인데, 화면에는 '쿼터·과부하'라고만 떠서
// 무엇이 막혔는지 사람이 알 길이 없었다. 실제로 gemini-flash-latest 별칭이 온종일
// 503을 뱉던 날, 화면만 보고는 키가 죽었는지 모델이 죽었는지 구분할 수 없었다.
// 마지막 실패 이유를 error 문구 안에 붙인다. 화면 코드는 어디서나 data.error만
// 읽으므로, 여기서 문구에 넣으면 클라이언트를 한 줄도 고치지 않고 다 좋아진다.
async function withGeminiReason(res) {
  if (res.status !== 502 || !lastGeminiError) return res;
  const data = await res.json().catch(() => null);
  if (!data?.error) return res;
  return Response.json({ ...data, error: withReason(data.error) }, { status: 502 });
}

async function handle(req) {
  const { action, ...body } = await req.json();
  return (
    (await handleMoments(action, body)) ??
    (await handlePublish(action, body)) ??
    (await handleMovies(action, body)) ??
    (await handleWatcha(action, body)) ??
    (await handleSongs(action, body)) ??
    Response.json({ error: "unknown action" }, { status: 400 })
  );
}
