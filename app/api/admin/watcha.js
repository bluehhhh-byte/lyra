// 왓챠 임포트·취향 리포트·추천 도메인 — route.js 디스패처가 호출.
// 처리하면 Response, 아니면 null.
//
// watchaImport — 항목 하나 처리. 42편을 한 요청에 넣으면 TMDB 호출이
// maxDuration을 넘기므로 클라이언트가 한 건씩 돌린다(재검사 도구와 같은 방식).
// create=false(기본)가 안전장치다: 별점 1,300개를 통째로 넣어도 이미 등록된
// 작품만 갱신하고 나머지는 skip한다. 코멘트처럼 새로 만들어야 할 때만 true.
// watchaRatings — 왓챠 별점을 데이터셋(data/watcha-movies.json)에 code로 병합.
// ~1,000편은 개별 .md가 없으므로 한 파일을 통째로 다시 쓴다(요청 1회).
// tasteReport — 집계 요약을 Gemini에 넘겨 한국어 리포트를 받아 저장.
// 원본 1000편이 아니라 요약 숫자만 넘기므로 토큰·rate limit 부담이 작다.
import { readMovie, writeMovie, readData, writeData } from "../../../lib/store";
import { searchMovies, movieDetail } from "../../../lib/tmdb";
import { getAllMovies } from "../../../lib/movies";
import { summarizeTaste } from "../../../lib/taste-core";
import { geminiText } from "../../../lib/admin/gemini";
import { setField } from "../../../lib/admin/frontmatter";

export async function handleWatcha(action, body) {
  if (action === "tasteReport") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const dataset = readData("watcha-movies.json", []);
    const rated = dataset.filter((m) => m.rating != null);
    if (rated.length < 20)
      return Response.json({ error: `평가된 영화가 ${rated.length}편뿐입니다 (20편 이상 필요)` }, { status: 422 });

    const s = summarizeTaste(rated);
    const text = await geminiText(
      key,
      `아래는 한 사람이 영화 ${s.count}편에 매긴 별점을 국가·장르·감독·연대·상영시간별로 집계한 것이다.
이 사람의 영화 취향을 분석하는 리포트를 한국어로 써라.
- 3~4개 문단, 각 문단 2~3문장. 소제목 없이 이어지는 산문
- '많이 본 것'과 '높게 평가한 것'의 차이에 주목하라(관람 편수 ≠ 선호)
- 구체적 근거(국가/장르/감독/연대와 그 평균 별점)를 문장에 녹여라
- 단정적 분석 톤, 평서문 '~다'체. "~습니다/~해요" 금지. 과장·아부 금지
- 마지막 문단은 이 사람이 좋아할 만한 방향을 한 문장으로 제안
집계:
${s.lines}`
    );
    if (!text) return Response.json({ error: "리포트 생성 실패 (쿼터·과부하)" }, { status: 502 });

    const report = { text: text.trim(), count: s.count, mean: s.mean, at: new Date().toISOString() };
    await writeData("taste-report.json", JSON.stringify(report, null, 1), `data: 취향 리포트 (${s.count}편)`);
    return Response.json(report);
  }

  // 추천 20편 — 취향 요약을 Gemini에 주고 '안 본' 영화를 추천받은 뒤,
  // 각 제목을 TMDB로 찾아 포스터·연도를 붙이고 이미 평가한 것은 걸러낸다.
  if (action === "tasteRecs") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const dataset = readData("watcha-movies.json", []);
    const rated = dataset.filter((m) => m.rating != null);
    if (rated.length < 20)
      return Response.json({ error: `평가된 영화가 ${rated.length}편뿐입니다 (20편 이상 필요)` }, { status: 422 });

    const s = summarizeTaste(rated);
    const norm = (t) => (t || "").toLowerCase().replace(/[\s:·・!?,.'"()\[\]/-]/g, "");
    const seenTitles = new Set(rated.map((m) => norm(m.title_ko || m.title)).concat(rated.map((m) => norm(m.title))));
    const seenTmdb = new Set(rated.map((m) => String(m.tmdbId)).filter(Boolean));
    // 회피 목록: 전체 1045편을 넣으면 프롬프트가 커져 Gemini가 느려지고
    // 타임아웃 위험이 커진다. 별점 높은 순 상위 300편만 준다 — 취향에 맞는
    // 추천일수록 이 상위권과 겹치고, 나머지 중복은 TMDB tmdbId·제목 필터가 잡는다.
    const seenList = [...rated]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 300)
      .map((m) => m.title_ko || m.title)
      .join(", ");

    const raw = await geminiText(
      key,
      `아래는 한 사람의 영화 취향 집계다.
${s.lines}
이 취향에 맞으면서 '아직 안 본' 영화 32편을 추천하라. JSON 배열로만:
[{"title":"영화 제목","year":"2019","why":"추천 이유"}]
규칙:
- 취향의 편애 지점(높은 평균 별점을 준 국가·장르·감독)을 파고들되, 뻔한 대흥행작·프랜차이즈는 피하고 발견의 재미가 있는 작품으로
- 이 사람은 영화를 많이 본다. 아래는 그중 높게 평가한 것들이니 이것도, 이와 비슷하게 유명한 것도 피하고 덜 알려진 발견작을 골라라:
${seenList}
- title은 한국 개봉명(없으면 원제). why는 취향과 연결한 한국어 40자 이내 한 구절
- 32편(TMDB 매칭·중복 탈락분 여유분). 순수 JSON만 출력`,
      true
    );
    let recs;
    try {
      recs = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
    } catch {
      return Response.json({ error: "추천 생성 실패 (응답 파싱)" }, { status: 502 });
    }
    if (!Array.isArray(recs) || !recs.length)
      return Response.json({ error: "추천이 비었습니다 (쿼터·과부하)" }, { status: 502 });

    // 제목→TMDB. 28건을 순차로 치면 maxDuration을 넘기니 병렬 검색 후 순서대로 채택.
    // TMDB는 검색 rate limit이 넉넉하다(Gemini와 달리).
    const searched = await Promise.all(
      recs.filter((r) => r?.title).map(async (r) => {
        try {
          return { r, results: await searchMovies(r.title) };
        } catch {
          return { r, results: [] };
        }
      })
    );
    // 누적: 기존 추천을 두고 새 것만 얹는다. 이미 추천한 것(prevTmdb)과
    // 그새 평가한 것(seenTmdb)은 제외한다 — 본 영화는 추천에서 빠진다.
    const prev = readData("taste-recs.json", { items: [] });
    const prevItems = (prev.items || []).filter((m) => !seenTmdb.has(String(m.tmdbId)));
    const prevTmdb = new Set(prevItems.map((m) => String(m.tmdbId)));
    const now = new Date().toISOString();

    const added = [];
    const usedTmdb = new Set();
    for (const { r, results } of searched) {
      if (added.length >= 20) break;
      const hit = results.find((c) => {
        if (c.mediaType !== "movie") return false;
        const id = String(c.tmdbId);
        if (seenTmdb.has(id) || prevTmdb.has(id) || usedTmdb.has(id)) return false;
        if (seenTitles.has(norm(c.title)) || seenTitles.has(norm(c.originalTitle))) return false;
        return !r.year || !c.year || Math.abs(+c.year - +r.year) <= 1;
      });
      if (!hit) continue;
      usedTmdb.add(String(hit.tmdbId));
      added.push({
        tmdbId: hit.tmdbId,
        title: hit.title,
        year: hit.year,
        poster: hit.thumb,
        why: String(r.why || "").trim(),
        at: now,
      });
    }
    if (!added.length && prevItems.length === prev.items?.length)
      return Response.json({ error: "새 추천을 찾지 못했습니다 (이미 추천했거나 본 작품)" }, { status: 502 });

    const items = [...added, ...prevItems]; // 최신 추천이 위로
    await writeData("taste-recs.json", JSON.stringify({ items, at: now }, null, 1), `data: 추천 +${added.length} (누적 ${items.length})`);
    return Response.json({ added: added.length, total: items.length });
  }

  if (action === "watchaRatings") {
    const items = Array.isArray(body.items) ? body.items : [];
    const byCode = new Map();
    for (const it of items) {
      const r = Number(it?.rating);
      if (it?.code && Number.isFinite(r) && r > 0 && r <= 5) byCode.set(it.code, r);
    }
    if (!byCode.size) return Response.json({ error: "별점이 있는 항목이 없습니다" }, { status: 400 });

    const dataset = readData("watcha-movies.json", []);
    let matched = 0, changed = 0, unknown = 0;
    for (const m of dataset) {
      if (!byCode.has(m.code)) continue;
      matched++;
      const r = byCode.get(m.code);
      if (m.rating !== r) { m.rating = r; changed++; }
    }
    for (const code of byCode.keys()) if (!dataset.some((m) => m.code === code)) unknown++;

    if (changed) await writeData("watcha-movies.json", JSON.stringify(dataset, null, 1), `data: 왓챠 별점 ${changed}편 병합`);
    return Response.json({ total: byCode.size, matched, changed, unknown });
  }

  if (action === "watchaImport") {
    const { item, apply = false, create = false } = body;
    if (!item?.title) return Response.json({ error: "title이 없습니다" }, { status: 400 });

    const norm = (s) => (s || "").toLowerCase().replace(/[\s:·・!?,.'"()\[\]/-]/g, "");
    const movies = getAllMovies();
    // watcha_code가 박혀 있으면 그게 가장 정확. 없으면 제목+연도로 찾는다.
    const found =
      (item.code && movies.find((m) => m.watcha_code === item.code)) ||
      movies.find(
        (m) =>
          (norm(m.title) === norm(item.title) || norm(m.title_ko) === norm(item.title)) &&
          (!item.year || !m.year || String(m.year) === String(item.year))
      );

    const rating = Number(item.rating);
    const hasRating = Number.isFinite(rating) && rating > 0 && rating <= 5;

    if (found) {
      if (!apply) return Response.json({ action: "update", slug: found.slug, title: found.title });
      // getAllMovies()는 파싱된 필드만 준다 — 파일 원문은 store에서 다시 읽는다
      const file = await readMovie(found.slug);
      if (!file) return Response.json({ action: "error", title: item.title, error: "파일을 못 읽음" });
      let out = file.raw.replace(/\r\n/g, "\n");
      const changed = [];
      if (hasRating && Number(found.rating) !== rating) {
        out = setField(out, "rating", String(Math.round(rating * 2) / 2), "runtime");
        changed.push("rating");
      }
      if (item.comment && !found.comment) {
        out = setField(out, "comment", item.comment.replace(/\s*\n+\s*/g, " "), "published");
        changed.push("comment");
      }
      // 다음 임포트가 제목 대조 없이 바로 찾도록 왓챠 코드를 남긴다
      if (item.code && found.watcha_code !== item.code) {
        out = setField(out, "watcha_code", item.code, "tmdbId");
        changed.push("watcha_code");
      }
      if (!changed.length) return Response.json({ action: "nochange", slug: found.slug, title: found.title });
      await writeMovie(found.slug, out, `edit(movie): watcha import — ${found.slug}`);
      return Response.json({ action: "updated", slug: found.slug, title: found.title, changed });
    }

    if (!create) return Response.json({ action: "skip", title: item.title });

    // 신규 등록 — TMDB에서 찾아 붙인다
    const results = await searchMovies(item.title);
    const scored = (results || []).map((c, i) => {
      let s = -i * 0.1;
      const cy = String(c.year || "");
      if (item.year && cy === String(item.year)) s += 10;
      else if (item.year && cy && Math.abs(+cy - +item.year) === 1) s += 4;
      else if (item.year && cy) s -= 3;
      if (norm(c.title) === norm(item.title) || norm(c.originalTitle) === norm(item.title)) s += 6;
      return { c, s };
    }).sort((a, b) => b.s - a.s);
    const hit = scored[0]?.s > 0 ? scored[0].c : null;
    if (!hit) return Response.json({ action: "nomatch", title: item.title });
    if (!apply) return Response.json({ action: "create", title: item.title, matched: `${hit.title} (${hit.year})` });

    const d = await movieDetail(hit.tmdbId, hit.mediaType);
    const flat = (item.comment || "").replace(/\s*\n+\s*/g, " ");
    const slug = `${d.title} ${d.year}`.toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-").replace(/^-|-$/g, "");
    const md = `---
title: ${d.title}
title_ko: ${d.title}
media: ${d.mediaType === "tv" ? "tv" : "movie"}
director: ${d.director || ""}
director_ko:
cast: ${d.cast || ""}
year: ${d.year || ""}
runtime: ${d.runtime || ""}
rating: ${hasRating ? Math.round(rating * 2) / 2 : ""}
genre: ${d.genre || ""}
poster: ${d.poster || ""}
backdrop: ${d.backdrop || ""}
tmdbId: ${d.tmdbId || ""}
watcha_code: ${item.code || ""}
tags: [${[d.country, d.genre, d.year].filter(Boolean).join(", ")}]
body_kind: ${item.comment ? "review" : ""}
date: ${new Date().toISOString().slice(0, 10)}
published: ${new Date().toISOString()}
comment: ${flat.length > 120 ? flat.slice(0, 117) + "…" : flat}
---
${(item.comment || "").trim()}
`;
    await writeMovie(slug, md, `add(movie): ${slug}`);
    return Response.json({ action: "created", slug, title: d.title });
  }

  return null;
}
