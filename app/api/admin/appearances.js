import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getAllMoviesMeta } from "../../../lib/movies";
import { searchMovies, movieDetail } from "../../../lib/tmdb";
import { researchSongContext } from "../../../lib/admin/song-appearance-suggest";
import { withReason, geminiText } from "../../../lib/admin/gemini";
import { suggestFromFreeSources } from "../../../lib/admin/appearance-search";
import {
  appearanceIdentity,
  APPEARANCE_ROLES,
  getSongAppearancesRuntime,
  normalizeAppearance,
  SONG_APPEARANCES_FILE,
  WORK_TYPES,
} from "../../../lib/song-appearances";
import { readSong, writeData } from "../../../lib/store";
import { gapsOf } from "../../../lib/appearance-gaps";

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

// 여러 건을 고쳤어도 커밋은 하나다 — 짧은 시간에 커밋을 여럿 만들지 않는다.
async function persistMany(data, items) {
  const next = { version: 1, updatedAt: new Date().toISOString(), items: data.items };
  const songs = [...new Set(items.filter(Boolean).map((item) => item.songSlug))];
  await writeData(
    SONG_APPEARANCES_FILE,
    `${JSON.stringify(next, null, 1)}\n`,
    `data: 작품 사용 정보 결손 ${items.length}건 보정`,
  );
  for (const slug of songs) revalidatePath(`/songs/${slug}`);
  for (const slug of [...new Set(items.filter((item) => item?.localMovieSlug).map((item) => item.localMovieSlug))])
    revalidatePath(`/movies/${slug}`);
  return next;
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
    // 근거 주소는 선택이다. 한동안 '확인됨'으로 공개하려면 http(s) 주소를
    // 요구했는데, 조사는 이제 AI가 먼저 하고 사람이 확인한다 — 출처가 검색
    // 결과나 크레딧 화면처럼 주소로 남지 않는 경우가 많아, 주소를 채우려고
    // 아무 페이지나 붙이거나 맞는 정보를 '검토 필요'로 묻어 두게 됐다.
    // 주소가 있으면 형식만 본다. 지어낸 주소를 막는 것은 여기가 아니라
    // AI 조사 쪽이다 — 모델이 고른 URL은 우리가 건넨 목록 안에 있어야 한다
    // (lib/admin/appearance-search.js, song-appearance-suggest.js).
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

  // ── 결손 메우기 ────────────────────────────────────────────────────────
  //
  // 감독 필드가 뒤늦게 생겨 기존 79건이 전부 비었다. 그중 tmdbId가 있는 것은
  // TMDB가 감독을 그대로 준다 — 사람도 AI도 필요 없다. 나머지만 밖으로 내보내
  // 채워 온다. 대량 작업(app/admin/bulk-work.js)과 같은 방식이다.
  if (action === "appearanceGaps") {
    const data = await getSongAppearancesRuntime();
    const rows = data.items.filter(gapsOf).map((item) => ({
      id: item.id,
      songSlug: item.songSlug,
      workTitle: item.workTitle,
      originalTitle: item.originalTitle,
      year: item.year,
      workType: item.workType,
      role: item.role,
      tmdbId: item.tmdbId,
      gaps: gapsOf(item),
    }));
    return Response.json({
      total: data.items.length,
      count: rows.length,
      // TMDB가 스스로 메울 수 있는 몫 — 버튼 한 번이면 끝난다
      auto: rows.filter((row) => row.tmdbId).length,
      items: rows,
    });
  }

  if (action === "appearanceGapFill") {
    const data = await getSongAppearancesRuntime();
    const targets = data.items.filter((item) => gapsOf(item));
    const movies = await getAllMoviesMeta();
    // tmdbId가 없는 항목은 제목으로 찾아 붙인다.
    //
    // 검색어는 원제를 먼저 쓴다. 한글 제목으로만 찾던 동안 「THE END OF
    // EVANGELION」도 「Weak Hero Class 1」도 못 찾았다 — TMDB에 있는데 우리가
    // 한국어 표기로만 물었기 때문이다. originalTitle은 대부분 채워져 있다.
    //
    // 제목은 한쪽이 다른 쪽을 품기만 해도 받아들인다(TMDB는 「약한영웅」,
    // 우리는 「약한영웅 Class 1」). 대신 연도와 매체 종류가 둘 다 맞아야 한다 —
    // 「해피 투게더」(1997 왕가위 / 2018 다른 작품)처럼 제목만 같은 남남이 섞이는
    // 것을 막는 것은 연도다. 틀린 감독을 넣느니 남겨 둔다.
    // 물결표는 문자가 여럿이다. 「再会〜Silent Truth〜」(U+301C)와 TMDB의
    // 「再会～Silent Truth～」(U+FF5E)는 눈에 같아 보이지만 다른 글자라, 지우지
    // 않으면 같은 작품을 남남으로 본다.
    const norm = (value) =>
      String(value || "").toLocaleLowerCase("ko-KR").replace(/[\s:·・!?,.'"()[\]\-~！～〜∼]/g, "");
    const titleClose = (a, b) => {
      const [x, y] = [norm(a), norm(b)];
      if (!x || !y) return false;
      return x === y || x.includes(y) || y.includes(x);
    };
    const wantTv = (type) => type === "drama" || type === "anime_series";
    for (const item of targets) {
      if (item.tmdbId) continue;
      const queries = [...new Set([item.originalTitle, item.workTitle].filter(Boolean))];
      for (const query of queries) {
        try {
          const hits = (await searchMovies(query)).filter((found) =>
            wantTv(item.workType) ? found.mediaType === "tv" : found.mediaType === "movie",
          );
          const sameYear = (found) => Number(found.year) === Number(item.year);
          const exact = (found) => norm(found.title) === norm(query) || norm(found.originalTitle) === norm(query);

          // 고르는 순서가 곧 안전장치다.
          //   1) 제목도 연도도 맞는 것
          //   2) 제목이 정확히 맞는 것 — TV만. 우리 연도는 그 곡이 쓰인 화의
          //      연도라 시리즈 시작 연도와 다르다(그레이 아나토미 2009 / TMDB 2005).
          //   3) 제목이 한쪽을 품고 연도가 맞는 것 — 1·2가 하나도 없을 때만.
          //
          // 3을 먼저 보면 「스몰빌」이 웹 스핀오프 「Smallville: Chloe Chronicles」에
          // 붙는다. 본편은 2001년이라 우리 연도(2003)와 어긋나고, 스핀오프는
          // 2003년이라 맞아떨어지기 때문이다. 실제로 그렇게 붙였다가 되돌렸다.
          const loose = (found) =>
            (norm(found.title).includes(norm(query)) || norm(query).includes(norm(found.title)) ||
              norm(found.originalTitle).includes(norm(query)) || norm(query).includes(norm(found.originalTitle))) &&
            sameYear(found);
          // 연도를 모르는 항목(Rambo III)은 제목이 정확히 맞는 후보가 하나뿐일
          // 때만 받는다. 둘 이상이면 고르지 않는다 — 연도가 없으면 가릴 것이 없다.
          const exacts = hits.filter(exact);
          const hit =
            hits.find((found) => exact(found) && sameYear(found)) ||
            (!item.year ? (exacts.length === 1 ? exacts[0] : null) : null) ||
            (wantTv(item.workType) && item.year ? exacts[0] : null) ||
            (item.year ? hits.find(loose) : null);
          if (hit) {
            item.tmdbId = hit.tmdbId;
            item.mediaType = hit.mediaType;
            break;
          }
        } catch {}
      }
    }
    const filled = [];
    const failed = [];
    for (const item of targets.slice(0, 200)) {
      // 위에서도 붙이지 못한 것은 TMDB에 물을 것이 없다 — 내보내기 몫이다
      if (!item.tmdbId) continue;
      try {
        const detail = await movieDetail(item.tmdbId, item.mediaType);
        const changed = [];
        const put = (field, value) => {
          if (!value || item[field]) return;
          item[field] = value;
          changed.push(field);
        };
        put("director", detail.director);
        // movieDetail은 ko-KR로 묻는다. 사람 이름에 한국어 표기가 있으면 TMDB가
        // 그것을 준다 — 실제로 표본 12건이 전부 한글이었다(미셸 공드리, 대니 보일).
        // 한글이 아니면 비워 둔다. 음차를 여기서 지어내지 않는다.
        if (/[가-힣]/.test(detail.director || "")) put("director_ko", detail.director);
        put("originalTitle", detail.originalTitle);
        put("poster", detail.poster);
        if (!item.year && detail.year) { item.year = Number(detail.year) || null; changed.push("year"); }
        const local = movies.find((movie) => Number(movie.tmdbId) === item.tmdbId)?.slug || "";
        put("localMovieSlug", local);
        if (changed.length) {
          item.updatedAt = new Date().toISOString();
          filled.push({ id: item.id, workTitle: item.workTitle, changed });
        }
      } catch (error) {
        failed.push({ id: item.id, workTitle: item.workTitle, why: error.message });
      }
    }
    if (filled.length) await persistMany(data, filled.map((row) => data.items.find((i) => i.id === row.id)));
    return Response.json({ filled, failed, remaining: data.items.filter(gapsOf).length });
  }

  if (action === "appearanceGapApply") {
    const rows = Array.isArray(body.items) ? body.items : [];
    if (!rows.length) return Response.json({ error: "items가 비어 있습니다" }, { status: 422 });
    const data = await getSongAppearancesRuntime();
    const byId = new Map(data.items.map((item) => [item.id, item]));
    const applied = [];
    const rejected = [];
    for (const row of rows.slice(0, 500)) {
      const item = byId.get(String(row.id || "").trim());
      if (!item) { rejected.push({ id: row.id, why: "없는 항목" }); continue; }
      const changed = [];
      const put = (field, value) => {
        const text = String(value ?? "").trim();
        if (!text || (item[field] && !body.overwrite)) return;
        item[field] = text.slice(0, 200);
        changed.push(field);
      };
      put("director_ko", row.director_ko);
      put("director", row.director);
      if (row.year !== undefined && String(row.year).trim()) {
        if (!/^\d{4}$/.test(String(row.year))) rejected.push({ id: row.id, why: `연도가 4자리가 아님: ${row.year}` });
        else if (!item.year || body.overwrite) { item.year = Number(row.year); changed.push("year"); }
      }
      if (row.workType !== undefined && String(row.workType).trim()) {
        if (!Object.hasOwn(WORK_TYPES, row.workType)) rejected.push({ id: row.id, why: `작품 종류가 목록 밖: ${row.workType}` });
        else { item.workType = row.workType; changed.push("workType"); }
      }
      if (row.role !== undefined && String(row.role).trim()) {
        if (!Object.hasOwn(APPEARANCE_ROLES, row.role)) rejected.push({ id: row.id, why: `사용 방식이 목록 밖: ${row.role}` });
        else { item.role = row.role; changed.push("role"); }
      }
      if (row.evidenceUrl !== undefined && String(row.evidenceUrl).trim()) {
        if (!validWebUrl(row.evidenceUrl)) rejected.push({ id: row.id, why: "근거 주소가 http(s)가 아님" });
        else if (!item.evidenceUrl || body.overwrite) { item.evidenceUrl = String(row.evidenceUrl).trim(); changed.push("evidenceUrl"); }
      }
      if (!changed.length) continue;
      item.updatedAt = new Date().toISOString();
      applied.push({ id: item.id, workTitle: item.workTitle, changed });
    }
    // apply가 아니면 무엇이 바뀔지만 돌려준다 — 대량 작업과 같은 미리보기 단계다
    if (body.apply !== true) return Response.json({ preview: true, applied, rejected });
    if (applied.length) await persistMany(data, applied.map((row) => byId.get(row.id)));
    return Response.json({ applied, rejected, remaining: data.items.filter(gapsOf).length });
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
