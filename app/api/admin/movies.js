// 영화 도메인 액션 — route.js 디스패처가 호출. 처리하면 Response, 아니면 null.
import { readMovie, writeMovie, deleteMovie } from "../../../lib/store";
import { searchMovies, movieDetail } from "../../../lib/tmdb";
import { capGenre } from "../../../lib/genre";
import { movieMetaGen } from "../../../lib/admin/movie-meta";
import { FM, fmValue, setField, parseTags } from "../../../lib/admin/frontmatter";
import { kstToday } from "../../../lib/kst";

export async function handleMovies(action, body) {
  if (action === "movieSearch") {
    return Response.json({ results: await searchMovies(body.query) });
  }

  if (action === "movieDetail") {
    return Response.json(await movieDetail(body.tmdbId, body.mediaType));
  }

  // Polish the auto-loaded TMDB synopsis into clean 줄거리 prose and draft a
  // personal comment — one JSON Gemini call for both (free-tier RPM is the
  // bottleneck). Country·genre·year tags are deterministic.
  if (action === "movieMeta") {
    const key = process.env.GEMINI_API_KEY;
    const { title, director, mediaType, synopsis, country, genre, year, rating, tmdbRating, tmdbVotes } = body;
    let polished = (synopsis || "").trim();
    let comment = "";
    if (key) {
      const g = await movieMetaGen({ key, title, director, mediaType, rating, synopsis: polished, tmdbRating, tmdbVotes });
      if (g.synopsis) polished = g.synopsis;
      comment = g.comment;
      if (!comment) return Response.json({ error: "코멘트 생성 실패" }, { status: 502 });
    }
    const tags = [country || "기타", capGenre(genre), year && String(year)].filter(Boolean);
    return Response.json({ polished, comment, tags: tags.join(", ") });
  }

  if (action === "movieSave") {
    const {
      title, titleKo, mediaType, director, directorKo, cast, year, runtime,
      rating, genre, poster, backdrop, tmdbId, tags, comment, synopsis, bodyKind,
    } = body;
    const slug = `${title} ${year}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
      .replace(/^-|-$/g, "");
    const md = `---
title: ${title}
title_ko: ${titleKo || title}
media: ${mediaType === "tv" ? "tv" : "movie"}
director: ${director || ""}
director_ko: ${directorKo || ""}
cast: ${cast || ""}
year: ${year || ""}
runtime: ${runtime || ""}
rating: ${rating || ""}
genre: ${genre || ""}
poster: ${poster || ""}
backdrop: ${backdrop || ""}
tmdbId: ${tmdbId || ""}
tags: [${(tags || "").split(",").map((t) => t.trim()).filter(Boolean).join(", ")}]
body_kind: ${bodyKind === "review" ? "review" : ""}
date: ${kstToday()}
published: ${new Date().toISOString()}
comment: ${(comment || "").replace(/\s*\n+\s*/g, " ")}
---
${(synopsis || "").trim()}
`;
    await writeMovie(slug, md, `add(movie): ${slug}`);
    return Response.json({ slug });
  }

  if (action === "movieRegenMeta" || action === "movieRegenComment") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const movie = await readMovie(body.slug);
    if (!movie) return Response.json({ error: "작품을 찾을 수 없음" }, { status: 404 });
    const raw = movie.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;

    const title = fmValue(fm, "title_ko") || fmValue(fm, "title");
    const director = fmValue(fm, "director_ko") || fmValue(fm, "director");
    const mediaType = fmValue(fm, "media") || "movie";
    const rating = fmValue(fm, "rating");
    // 줄거리 정돈 + 코멘트를 한 번에 — regenComment는 synopsis 결과만 버린다
    const g = await movieMetaGen({ key, title, director, mediaType, rating, synopsis: bodyText });
    const comment = g.comment;
    if (!comment) return Response.json({ error: "코멘트 생성 실패" }, { status: 502 });

    let out = setField(raw, "comment", comment, "published");
    const updated = ["comment"];

    if (action === "movieRegenMeta") {
      let polished = bodyText.trim();
      if (g.synopsis) {
        polished = g.synopsis;
        updated.push("synopsis");
      }
      const tags = [
        parseTags(fmValue(fm, "tags"))[0] || "기타",
        capGenre(fmValue(fm, "genre")),
        fmValue(fm, "year"),
      ].filter(Boolean);
      if (tags.length) {
        out = setField(out, "tags", `[${tags.join(", ")}]`, "tmdbId");
        updated.push("tags");
      }
      out = out.replace(FM, (_, nextFm) => `---\n${nextFm}\n---\n${polished.replace(/\n*$/, "\n")}`);
    }

    await writeMovie(
      body.slug,
      out,
      action === "movieRegenMeta"
        ? `chore(movie): regen metadata — ${body.slug}`
        : `chore(movie): regen comment — ${body.slug}`
    );
    return Response.json({ comment, updated });
  }

  if (action === "movieUpdateRating") {
    const movie = await readMovie(body.slug);
    if (!movie) return Response.json({ error: "작품을 찾을 수 없음" }, { status: 404 });
    const rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5)
      return Response.json({ error: "별점은 0~5 사이여야 합니다" }, { status: 422 });
    const rounded = Math.round(rating * 2) / 2;
    const out = setField(movie.raw.replace(/\r\n/g, "\n"), "rating", rounded ? String(rounded) : "", "runtime");
    await writeMovie(body.slug, out, `edit(movie): update rating — ${body.slug}`);
    return Response.json({ rating: rounded });
  }

  if (action === "movieDelete") {
    await deleteMovie(body.slug);
    return Response.json({ ok: true });
  }

  return null;
}
