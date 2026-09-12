import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getAllMoviesMeta } from "../../../lib/movies";
import { searchMovies, movieDetail } from "../../../lib/tmdb";
import { researchSongContext } from "../../../lib/admin/song-appearance-suggest";
import { withReason, geminiText } from "../../../lib/admin/gemini";
import { suggestFromFreeSources } from "../../../lib/admin/appearance-search";
import {
  appearanceIdentity,
  getSongAppearancesRuntime,
  normalizeAppearance,
  SONG_APPEARANCES_FILE,
} from "../../../lib/song-appearances";
import { readSong, writeData } from "../../../lib/store";

const validWebUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

async function findLocalMovieSlug(item) {
  if (!item.tmdbId) return "";
  const movies = await getAllMoviesMeta();
  return movies.find((movie) => Number(movie.tmdbId) === item.tmdbId)?.slug || "";
}

async function persist(data, item) {
  const next = { version: 1, updatedAt: new Date().toISOString(), items: data.items };
  await writeData(SONG_APPEARANCES_FILE, `${JSON.stringify(next, null, 1)}\n`, `data: 작품 사용 정보 — ${item.songSlug}`);
  revalidatePath(`/songs/${item.songSlug}`);
  if (item.localMovieSlug) revalidatePath(`/movies/${item.localMovieSlug}`);
  return next;
}

export async function handleAppearances(action, body) {
  if (action === "appearanceSuggest") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const research = await researchSongContext({ key, ...body });
    // Quota/timeout/model failures used to become `suggestion: null`, which the
    // form described as "no appearance exists". Keep a genuine researched
    // negative distinct from a lookup that never completed.
    if (!research) {
      // 그라운딩이 막혀도 기능 전체를 죽이지 않는다. 막힌 것은 검색이지 생성이
      // 아니므로, 무료 소스(Apple Music·위키백과)로 후보를 찾아 일반 Gemini가
      // 고르게 한다. 근거 URL은 그 소스의 응답에서 그대로 오므로 지어낼 수 없다.
      //
      // 이쪽이 그라운딩만큼 넓지는 않다 — 검증된 79건에 대고 재 보니 후보 안에
      // 정답이 들어 있는 비율이 22%다(한국 OST 46%, 영어 18%, 일본 14%).
      // 그래서 못 찾은 것을 "수록 정보 없음"이라고 말하지 않는다.
      const free = await suggestFromFreeSources({
        key,
        title: body.title,
        artist: body.artist,
        lang: body.lang,
        geminiText,
        // 있으면 일반 웹 검색까지 쓴다. 없으면 Apple Music·위키백과만으로 돈다 —
        // 좁지만 죽지는 않는다.
        braveKey: process.env.BRAVE_API_KEY || "",
      });
      return Response.json({
        suggestion: free.appearance,
        appearanceState: free.state,
        researchWarning: free.warning,
        sources: (free.candidates || []).map((c) => ({ uri: c.uri, title: c.label })),
        researchComment: "",
        commentBasis: "",
        commentSources: [],
      });
    }
    let suggestion = research.appearance;
    const researchMeta = {
      researchComment: research.comment,
      commentBasis: research.commentBasis,
      commentSources: research.commentSources,
      appearanceState: research.appearanceState,
      researchWarning: research.warning,
      sources: research.sources,
    };
    if (!suggestion) return Response.json({ suggestion: null, ...researchMeta });

    // AI가 확인한 작품명을 기존 TMDB 검색으로 정규화한다. 실패해도 근거가 있는
    // 수동 작품 정보는 그대로 남겨 사용자가 검수할 수 있다.
    try {
      const results = await searchMovies(suggestion.workTitle);
      const sameYear = results.find((item) => suggestion.year && Number(item.year) === Number(suggestion.year));
      const candidate = sameYear || results[0];
      if (candidate) {
        const detail = await movieDetail(candidate.tmdbId, candidate.mediaType);
        const workType = detail.isAnimation
          ? detail.mediaType === "tv" ? "anime_series" : "anime_movie"
          : detail.mediaType === "tv" ? "drama" : "movie";
        suggestion = {
          ...suggestion,
          workTitle: detail.title || suggestion.workTitle,
          originalTitle: detail.originalTitle || suggestion.originalTitle,
          workType,
          mediaType: detail.mediaType,
          tmdbId: detail.tmdbId,
          year: detail.year || suggestion.year,
          poster: detail.poster || "",
        };
      }
    } catch {}
    return Response.json({ suggestion, ...researchMeta });
  }

  if (action === "appearanceList") {
    const songSlug = String(body.songSlug || "").trim();
    const data = await getSongAppearancesRuntime();
    return Response.json({ items: data.items.filter((item) => item.songSlug === songSlug) });
  }

  if (action === "appearanceSave") {
    const songSlug = String(body.songSlug || "").trim();
    if (!songSlug || !(await readSong(songSlug)))
      return Response.json({ error: "연결할 곡을 찾을 수 없습니다" }, { status: 404 });

    let item = normalizeAppearance({ ...body, songSlug });
    if (!item.workTitle) return Response.json({ error: "작품명을 입력해 주세요" }, { status: 422 });
    if (item.status === "verified" && !validWebUrl(item.evidenceUrl))
      return Response.json({ error: "확인된 정보에는 http(s) 근거 주소가 필요합니다" }, { status: 422 });
    if (item.evidenceUrl && !validWebUrl(item.evidenceUrl))
      return Response.json({ error: "근거 주소 형식을 확인해 주세요" }, { status: 422 });

    item = {
      ...item,
      id: randomUUID(),
      localMovieSlug: await findLocalMovieSlug(item),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const data = await getSongAppearancesRuntime();
    const existing = data.items.find((current) => appearanceIdentity(current) === appearanceIdentity(item));
    // Grounded comment regeneration may rediscover an already saved tie-in.
    // Make that path idempotent instead of turning successful research into a
    // duplicate error.
    if (existing) return Response.json({ item: existing, unchanged: true });
    data.items.push(item);
    await persist(data, item);
    return Response.json({ item });
  }

  if (action === "appearanceDelete") {
    const id = String(body.id || "").trim();
    const data = await getSongAppearancesRuntime();
    const item = data.items.find((current) => current.id === id);
    if (!item) return Response.json({ error: "삭제할 연결을 찾을 수 없습니다" }, { status: 404 });
    data.items = data.items.filter((current) => current.id !== id);
    await persist(data, item);
    return Response.json({ ok: true });
  }

  return null;
}
