import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getAllMoviesMeta } from "../../../lib/movies";
import { searchMovies, movieDetail } from "../../../lib/tmdb";
import { suggestSongAppearance } from "../../../lib/admin/song-appearance-suggest";
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
    let suggestion = await suggestSongAppearance({ key, ...body });
    if (!suggestion) return Response.json({ suggestion: null });

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
    return Response.json({ suggestion });
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
    if (data.items.some((current) => appearanceIdentity(current) === appearanceIdentity(item)))
      return Response.json({ error: "같은 작품·사용 방식·회차 연결이 이미 있습니다" }, { status: 409 });
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
