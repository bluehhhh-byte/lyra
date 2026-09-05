// 곡(음악) 도메인 액션 — route.js 디스패처가 호출. 처리하면 Response, 아니면 null.
import { readSong, writeSong, deleteSong, readRuntimeData, writeData, commitFiles } from "../../../lib/store";
import { getAllSongsRuntime, getAllSongsMeta, capitalizeLyricLines, parseFrontmatter, parseLyrics } from "../../../lib/songs";
import { translationVariants } from "../../../lib/translation-variants";
import { GENRES, capGenre, COUNTRY_TAGS, genreTagOf, genreIssue } from "../../../lib/genre";
import { EMOTIONS, parseEmotion, parseKeywords } from "../../../lib/keywords";
import { geminiText, GEMINI_LITE_MODEL, LONG_FORM_TIMEOUT_MS, withReason } from "../../../lib/admin/gemini";
import { researchSongContext } from "../../../lib/admin/song-appearance-suggest";
import { FM, fmValue, isBlank, parseTags, setField } from "../../../lib/admin/frontmatter";
import { hasCJK, nativeMeta, findLyrics } from "../../../lib/admin/lrclib";
import { normText, fetchArtistCatalog, withTimeout, itunesToResult, searchItunesStorePage } from "../../../lib/admin/itunes";
import { buildSearchQueries, mergeExternalSongResults } from "../../../lib/admin/music-search";
import {
  needsReading, translateLyrics, normalizeInterleaved, restanzaBody,
  carryNotes, computeAuto, originalLyrics, lyricLineCount, isJaLine,
} from "../../../lib/admin/song-meta";
import { kstToday } from "../../../lib/kst";
import { summarizeMusicTaste } from "../../../lib/music-taste-core";
import { makeBasedOnCleaner } from "../../../lib/admin/based-on";
import { TYPES as CORRECTION_TYPES, lineHash } from "../../../lib/admin/corrections";
import {
  correctionEvidenceRows,
  correctionEvidenceState,
  correctionEvidenceSummary,
} from "../../../lib/admin/correction-evidence";

import { songNeeds, summarizeNeeds, isNoteLine } from "../../../lib/admin/needs";
import { appendReportVersion } from "../../../lib/report-history";
import { findDuplicateSong, mergeDuplicateSongDocuments } from "../../../lib/admin/song-duplicate";
import { enrollAppearanceCheckpoint } from "../../../lib/admin/research-budget";
import { appearanceIdentity } from "../../../lib/song-appearances";
import { applySections, originalLines } from "../../../lib/admin/lyric-sections";
import { applyGenre, genreStatus } from "../../../lib/admin/genre-fix";

const CORRECTIONS_FILE = "lyrics-corrections.json";
const commentSourceUrls = (values) => (Array.isArray(values) ? values : [])
  .map((value) => {
    try {
      const url = new URL(String(value || "").trim());
      return /^https?:$/.test(url.protocol) && !url.href.includes(",") ? url.href : "";
    } catch { return ""; }
  })
  .filter(Boolean)
  .filter((value, index, all) => all.indexOf(value) === index)
  .slice(0, 3);
const setCommentWithProvenance = (raw, comment, basis = "manual", sources = []) => {
  const urls = commentSourceUrls(sources);
  let next = setField(raw, "comment", comment, "date");
  next = setField(next, "comment_basis", basis, "comment");
  return setField(next, "comment_sources", `[${urls.join(", ")}]`, "comment_basis");
};

const variantsFromRaw = (raw) => {
  const { body } = parseFrontmatter((raw || "").replace(/\r\n/g, "\n"));
  return translationVariants(parseLyrics(body).flatMap((stanza) => stanza.lines));
};

export async function handleSongs(action, body) {
  // 스크립트로 DB를 직접 고친 뒤 캐시를 비운다. 캐시 무효화는 lib/store.js의
  // 저장 경로에만 있어서, migrate-content.mjs나 retranslate.mjs로 고친 내용은
  // 사이트에 반영되지 않고 옛 값이 계속 서빙됐다. 배포로도 지워지지 않는다 —
  // Next 데이터 캐시는 태그로만 지워진다.
  if (action === "revalidate") {
    const { revalidateTag, revalidatePath } = await import("next/cache");
    for (const tag of ["lyra-content", "lyra-songs", "lyra-movies", "lyra-data", "lyra-moments"])
      revalidateTag(tag);
    revalidatePath("/", "layout");
    return Response.json({ ok: true, revalidated: ["lyra-content", "lyra-songs", "lyra-movies", "lyra-data", "lyra-moments"] });
  }

  if (action === "search") {
    const PAGE = 50; // per store — Apple caps at 200; 50 keeps latency sane and triples visible depth vs 25
    const query = String(body.query || "").trim().slice(0, 200);
    if (!query) return Response.json({ results: [], hasMore: false, nextCursor: { apple: null }, sources: [], sourceStatus: [] });
    const legacyOffset = Math.max(0, Number(body.offset) || 0);
    const suppliedCursor = body.cursor && typeof body.cursor === "object" ? body.cursor : null;
    const cursor = suppliedCursor || { apple: legacyOffset };
    const appleOffset = cursor.apple === null ? null : Math.max(0, Number(cursor.apple) || 0);
    const registeredSongs = await getAllSongsMeta();
    const searchQueries = buildSearchQueries(query, registeredSongs);
    const externalQuery = searchQueries.at(-1) || query;
    // free-text search across title and artist — iTunes matches both by default
    // search US/KR/JP stores together — each store has a different catalog
    // Normal /search across stores + the artist catalog (for hidden 19금 tracks),
    // in parallel. Catalog runs only on the first page — its tracks are folded in
    // once, filtered to title matches below, so paging stays search-only.
    const [storePages, catalog] = await Promise.all([
      appleOffset === null
        ? Promise.resolve([])
        : Promise.all(["US", "KR", "JP"].map((country) => searchItunesStorePage(country === "JP" ? externalQuery : query, country, { limit: PAGE, offset: appleOffset }))),
      appleOffset === 0 ? withTimeout(fetchArtistCatalog(externalQuery), 3500) : Promise.resolve([]),
    ]);
    const stores = storePages.map((page) => page.results);
    const q = normText(externalQuery);
    const words = q.split(" ").filter(Boolean);
    // One scoring pool: store tracks + catalog tracks the /search dropped
    // (19금/explicit). Query words already covered by the catalog's artist names
    // are the "artist" part; whatever's left is the "title" part. Artist-only
    // search ("Master Muzik") has no leftover title words → include the whole
    // catalog (its hidden tracks too). "Master Muzik 도련님" leaves 도련님 → keep
    // only catalog tracks whose title matches, so the discography doesn't flood.
    const catalogArtists = normText([...new Set(catalog.map((r) => r.artistName))].join(" "));
    const titleWords = words.filter((w) => w.length > 1 && !catalogArtists.includes(normText(w)));
    const seen = new Set();
    const pool = [];
    const add = (r) => {
      const key = `${r.trackName}|${r.artistName}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      pool.push(r);
    };
    for (let i = 0; i < PAGE; i++) for (const s of stores) if (s[i]) add(s[i]);
    for (const r of catalog)
      if (!titleWords.length || titleWords.some((w) => normText(r.trackName).includes(w))) add(r);
    const appleResults = pool.map(itunesToResult);
    const results = mergeExternalSongResults([appleResults], searchQueries)
      .map((result) => ({ ...result, registered: findDuplicateSong(result, registeredSongs) }));
    const failedStores = storePages.filter((page) => !page.ok);
    const appleOk = appleOffset === null || storePages.some((page) => page.ok);
    const appleHasMore = storePages.some((page) => page.hasMore);
    const appleNext = appleOffset === null
      ? null
      : failedStores.length
        ? appleOffset
        : appleHasMore ? appleOffset + PAGE : null;
    const sourceStatus = [
      {
        id: "apple",
        label: "Apple Music",
        ok: appleOk,
        partial: failedStores.length > 0 && appleOk,
        error: failedStores.length ? `${failedStores.length}/3개 스토어 응답 실패` : "",
      },
    ];
    return Response.json({
      results,
      hasMore: appleNext !== null,
      nextCursor: { apple: appleNext },
      sources: results.some((result) => result.source === "apple") ? ["Apple Music"] : [],
      sourceStatus,
      searchQueries,
    });
  }

  if (action === "lyrics") {
    const found = await findLyrics(body);
    if (found) return Response.json({ lyrics: found.lyrics });

    // #3 — not on lrclib: hand back native-name search links so the user can
    // grab the lyrics from the source and paste them, instead of a dead end.
    const native = hasCJK(`${body.title}${body.artist}`)
      ? null
      : await nativeMeta(body.trackId);
    const t = native?.title || body.title;
    const a = native?.artist || body.artist;
    const q = encodeURIComponent(`${t} ${a} 가사`);
    return Response.json({
      lyrics: null,
      searchLinks: [
        { label: "Google", url: `https://www.google.com/search?q=${q}` },
        {
          label: "lrclib",
          url: `https://lrclib.net/search/${encodeURIComponent(`${t} ${a}`)}`,
        },
      ],
    });
  }

  // #5 — a stored song may hold a partial transcription (iTunes' romanized name
  // yields a shorter one). Scanning all songs in one request overruns the
  // serverless timeout (FUNCTION_INVOCATION_TIMEOUT), so it's split: the client
  // gets the roster instantly, then checks one song per request.
  if (action === "requalityList") {
    return Response.json({
      songs: (await getAllSongsRuntime()).map((s) => ({ slug: s.slug, title: s.title, artist: s.artist })),
    });
  }

  if (action === "requalityOne") {
    const s = (await getAllSongsRuntime()).find((x) => x.slug === body.slug);
    if (!s) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const have = s.stanzas.reduce((n, st) => n + st.lines.filter((l) => l.en?.trim()).length, 0);
    const found = await findLyrics(
      { title: s.title, artist: s.artist, album: s.album, duration: s.duration, trackId: s.trackId },
      15000 // budget per song so a rescan stays snappy
    );
    // measure the candidate the same way `have` was measured — lrclib bodies
    // sometimes carry [Verse 1] headers, which would otherwise pad the count
    const foundLines = found ? lyricLineCount(found.lyrics) : 0;
    // only surface a meaningfully fuller version (guards transcription noise)
    const fuller = found && foundLines >= have + 5;
    // hand the text back with the count so "교체" doesn't have to hit lrclib
    // again — the refetch plus two Gemini calls would overrun maxDuration.
    return Response.json({
      have,
      found: fuller ? foundLines : null,
      lyrics: fuller ? found.lyrics : undefined,
    });
  }

  // Replace a partial transcription with the fuller one found by the rescan, and
  // regenerate the translation for it. The old body is discarded, so the write
  // is deliberately the LAST thing here: if Gemini stalls and the request times
  // out, the song is left untouched rather than half-rewritten.
  if (action === "requalityApply") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, oldBody] = m;

    const fresh = (body.lyrics || "").trim();
    if (!fresh) return Response.json({ error: "교체할 가사가 비었습니다" }, { status: 400 });
    // Re-check the client's claim. A stale or buggy caller must never be able to
    // trade a full transcription for a shorter one.
    const had = lyricLineCount(oldBody);
    if (lyricLineCount(fresh) <= had)
      return Response.json(
        { error: `새 가사가 더 온전하지 않습니다 (현재 ${had}줄 → 새 가사 ${lyricLineCount(fresh)}줄)` },
        { status: 409 }
      );

    const translated = await translateLyrics(key, {
      title: fmValue(fm, "title"),
      artist: fmValue(fm, "artist"),
      lang: fmValue(fm, "lang") || "",
      lyrics: fresh,
    });
    if (!translated) return Response.json({ error: "번역 생성 실패" }, { status: 502 });

    let newBody = translated.trim();
    try {
      const restanza = await restanzaBody({
        title: fmValue(fm, "title"),
        artist: fmValue(fm, "artist"),
        bodyText: newBody,
        key,
      });
      if (restanza) newBody = restanza;
    } catch {} // layout is cosmetic — never lose the new lyrics over it
    const { body: withNotes, kept, lost } = carryNotes(oldBody, newBody);

    await writeSong(
      body.slug,
      `---\n${fm}\n---\n${withNotes.trim()}\n`,
      `chore(song): fuller transcription — ${body.slug}`
    );
    return Response.json({ lines: lyricLineCount(withNotes), notesKept: kept, notesLost: lost });
  }

  if (action === "translate") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const text = await translateLyrics(key, body);
    if (!text) return Response.json({ error: "Gemini 응답이 비었습니다" }, { status: 502 });
    return Response.json({ text });
  }

  if (action === "autotag") {
    return Response.json(await computeAuto(body));
  }


  // Format lint — 무엇이 빠졌는지는 lib/admin/needs.js 한 곳에서만 판정한다.
  // 예전에는 이 화면이 자체 규칙을 갖고 있어, 파서를 고쳐 해결된 것(병합 번역 `>^N`,
  // 🗨 해설 줄, 외국곡 속 한국어 가사)까지 "번역 없음"으로 세고 있었다.
  if (action === "lint") {
    const report = (await getAllSongsRuntime())
      .map((s) => {
        const issues = summarizeNeeds(s).filter((t) => !/커버|연도|가사 없음|코멘트|한글 제목/.test(t));
        return { slug: s.slug, title: s.title, artist: s.artist, issues, genreFix: issues.some((t) => t.startsWith("장르")) };
      })
      .filter((s) => s.issues.length);
    return Response.json({ report, total: (await getAllSongsRuntime()).length });
  }

  // Auto-fix what lint found, one song per request (timeout-safe, one commit
  // per song). Inline markers are split mechanically; missing translations and
  // readings are generated ONLY for the lines that lack them — existing
  // (hand-edited) annotations are never touched.
  if (action === "lintFix") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw0 = song.raw.replace(/\r\n/g, "\n");
    const m = raw0.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const fixed = [];

    let fixedBody = normalizeInterleaved(bodyText);
    if (fixedBody !== bodyText) fixed.push("인라인 마커 분리");

    // a Korean song with no ">" lines at all chose "번역 없음" — respect that
    const lang = fmValue(fm, "lang") || "en";
    const skipTranslate = lang === "ko" && !/^\s*>/m.test(fixedBody);

    const lines = fixedBody.split("\n");
    const isOrig = (l) => {
      const t = l.trim();
      return (
        t &&
        !t.startsWith(">") &&
        !t.startsWith("+") &&
        !t.startsWith("//") &&
        !isNoteLine(t) &&                       // 🗨·✏는 본인 해설 — 가사가 아니다
        !(t.startsWith("[") && t.endsWith("]"))
      );
    };
    // 이 줄을 아래쪽 `>^N` 번역이 덮고 있는지 — 덮인 줄에 번역을 또 붙이면
    // 같은 구절이 두 번 나오고 `>^N` 범위가 어긋난다 (실제로 그렇게 깨졌다).
    const coveredBySpan = (i) => {
      let gap = 0;
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j].trim();
        if (!t || /^\[.*\]$/.test(t)) return false;
        const sp = t.match(/^>\^(\d+)/);
        if (sp) return Number(sp[1]) > gap + 1;   // 자기 줄 말고 위쪽까지 덮는가
        if (/^[>+]/.test(t) || t.startsWith("//")) return false;
        gap++;
      }
      return false;
    };
    const needs = []; // { i, text, wantReading, wantKo }
    for (let i = 0; i < lines.length; i++) {
      if (!isOrig(lines[i])) continue;
      let hasKo = false;
      let hasReading = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*>/.test(lines[j])) hasKo = true;
        else if (/^\s*\+/.test(lines[j])) hasReading = true;
        else break;
      }
      const text = lines[i].trim();
      const wantReading = isJaLine(text) && !hasReading;
      // 이미 한글인 줄에 한국어 번역을 붙이지 않는다 (외국곡 속 한국어 가사·표시 빠진 번역)
      const hangul = (text.match(/[가-힣]/g) || []).length;
      const alreadyKorean = hangul >= 2 && (text.match(/[a-zA-Z぀-ヿ一-鿿]/g) || []).length < hangul;
      const wantKo = !hasKo && !skipTranslate && !alreadyKorean && !coveredBySpan(i);
      if (wantReading || wantKo) needs.push({ i, text, wantReading, wantKo });
    }

    // no Gemini key → still save the mechanical fixes, just skip generation
    const key = process.env.GEMINI_API_KEY;
    if (needs.length && !key) {
      fixed.push("번역·독음 생성 건너뜀 (GEMINI_API_KEY 없음)");
      needs.length = 0;
    }

    if (needs.length) {
      const prompt = `아래 JSON 배열의 각 가사 줄에 대해, 같은 순서·같은 길이의 JSON 배열로 답해줘.
각 원소는 { "reading": "...", "ko": "..." } 형태.
규칙:
- 줄의 주 언어가 한국어 → ko에 자연스러운 영어 번역, reading은 빈 문자열
- 영어 → ko에 자연스러운 한국어 번역, reading은 빈 문자열
- 일본어 → reading에 한글 독음, ko에 자연스러운 한국어 번역
- 시적 뉘앙스 유지, 직역 금지. JSON만 출력.
곡: "${fmValue(fm, "title")}" (${fmValue(fm, "artist")})
입력:
${JSON.stringify(needs.map((n) => n.text))}`;
      let arr;
      try {
        arr = JSON.parse((await geminiText(key, prompt, true)).replace(/^```json\s*|\s*```$/g, "").trim());
      } catch {
        return Response.json({ error: "Gemini 응답 파싱 실패" }, { status: 502 });
      }
      if (!Array.isArray(arr))
        return Response.json({ error: "Gemini 응답 형식 오류" }, { status: 502 });

      let addedKo = 0;
      let addedReading = 0;
      // bottom-up so earlier indexes stay valid while splicing
      for (let k = needs.length - 1; k >= 0; k--) {
        const n = needs[k];
        const r = arr[k] || {};
        const ins = [];
        if (n.wantReading && r.reading?.trim()) {
          ins.push(`+ ${String(r.reading).trim()}`);
          addedReading++;
        }
        if (n.wantKo && r.ko?.trim()) {
          // 한국어 곡이면 이 ko는 영어 번역이다 — 추가 흐름과 같은 대문자 규칙을
          // 적용한다. 새로 넣는 줄에만 닿으므로 기존 본문은 그대로다.
          ins.push(`> ${capitalizeLyricLines(String(r.ko).trim())}`);
          addedKo++;
        }
        if (!ins.length) continue;
        // "+" sits right under the original; a lone ">" goes after existing "+" lines
        let at = n.i + 1;
        if (!n.wantReading) while (at < lines.length && /^\s*\+/.test(lines[at])) at++;
        lines.splice(at, 0, ...ins);
      }
      if (addedKo) fixed.push(`번역 ${addedKo}줄 추가`);
      if (addedReading) fixed.push(`독음 ${addedReading}줄 추가`);
      fixedBody = lines.join("\n");
    }

    if (!fixed.length) return Response.json({ fixed: [] });
    await writeSong(
      body.slug,
      `---\n${fm}\n---\n${fixedBody.replace(/\n*$/, "\n")}`,
      `fix(song): lint autofix — ${body.slug}`
    );
    return Response.json({ fixed });
  }

  // Which songs are missing generated metadata. `artist_ko` only counts as
  // missing for kanji/kana artists — a latin name has no reading to give.
  if (action === "audit") {
    const list = (await getAllSongsRuntime())
      .map((s) => {
        const missing = [];
        if (!s.tags?.length) missing.push("tags");
        if (!s.comment) missing.push("comment");
        if (!s.title_ko) missing.push("title_ko");
        if (needsReading(s.artist) && !s.artist_ko) missing.push("artist_ko");
        return { slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork, missing };
      })
      .filter((s) => s.missing.length);
    return Response.json({ list });
  }

  // Fill only the blank fields of one song, leaving everything else untouched.
  // ponytail: one commit (and one Vercel rebuild) per song. Fine for a few songs;
  // batch through the git trees API if this ever runs over dozens.
  if (action === "backfill") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;

    const artist = fmValue(fm, "artist");
    const auto = await computeAuto({
      title: fmValue(fm, "title"),
      artist,
      lyrics: originalLyrics(bodyText),
      lang: fmValue(fm, "lang") || "en",
      year: fmValue(fm, "year"),
      genre: fmValue(fm, "genre"), // stored on save; empty for pre-change songs
    });

    let out = raw;
    const filled = [];
    if (isBlank(fmValue(fm, "tags")) && auto.tags.length) {
      out = setField(out, "tags", `[${auto.tags.join(", ")}]`, "year");
      filled.push("tags");
    }
    if (isBlank(fmValue(fm, "comment")) && auto.comment) {
      out = setCommentWithProvenance(out, auto.comment, "lyrics_only");
      filled.push("comment");
    }
    if (isBlank(fmValue(fm, "title_ko")) && auto.titleKo) {
      out = setField(out, "title_ko", auto.titleKo, "title");
      filled.push("title_ko");
    }
    if (needsReading(artist) && isBlank(fmValue(fm, "artist_ko")) && auto.artistKo) {
      out = setField(out, "artist_ko", auto.artistKo, "artist");
      filled.push("artist_ko");
    }

    if (!filled.length) return Response.json({ filled: [] });
    await writeSong(body.slug, out, `chore(song): backfill ${filled.join(",")} — ${body.slug}`);
    return Response.json({ filled });
  }

  // Regenerate ALL AI metadata (tags·comment·title_ko·artist_ko) for one song,
  // OVERWRITING existing values. Lyrics and non-AI fields (album/year/artwork…)
  // are untouched. Driven one song per request from the client (timeout-safe).
  // Targeted backfill: fill keywords + emotion WITHOUT touching anything else —
  // regenMeta would also regenerate the comment/tags, clobbering hand-edited
  // ones. This reads only the Korean text of the body (originals of ko songs,
  // `>` translations of en/ja songs; `+` readings and `//` notes excluded).
  if (action === "regenKeywords") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;

    const koText = bodyText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^\[/.test(l) && !/^\+/.test(l) && !/^\/\//.test(l))
      .map((l) => l.replace(/^>\s?/, ""))
      .filter((l) => /[가-힣]/.test(l))
      .join("\n");
    if (!koText) return Response.json({ error: "한국어 가사 텍스트가 없습니다" }, { status: 422 });

    const rawJson = await geminiText(
      key,
      `노래 "${fmValue(fm, "title")}" (${fmValue(fm, "artist")})의 한국어 가사에 대해 JSON으로만 답해줘.
- keywords: 자주 등장하거나 주제를 관통하는 핵심 단어 3~5개의 배열. 반드시 아래 텍스트에 실제로 나오는 단어(명사 위주, 1~6자)만. 문장·구절 금지
- emotion: 이 곡의 감정을 아래 목록에서 정확히 하나만. 목록: ${EMOTIONS.join(", ")}
가사:
${koText.slice(0, 2000)}`,
      true,
      GEMINI_LITE_MODEL // 키워드·감정 추출은 분류 작업 — 일괄 소급의 쿼터 주범이라 lite로
    );
    let kw = [], emotion = "";
    try {
      const json = JSON.parse(rawJson.replace(/^```json\s*|\s*```$/g, "").trim());
      kw = parseKeywords(json.keywords);
      emotion = parseEmotion(json.emotion);
    } catch {}
    if (!kw.length && !emotion)
      return Response.json({ error: "AI 호출 실패 (쿼터·과부하)" }, { status: 502 });

    let out = raw;
    if (kw.length) out = setField(out, "keywords", `[${kw.join(", ")}]`, "tags");
    if (emotion) out = setField(out, "emotion", emotion, "tags");
    await writeSong(body.slug, out, `chore(song): keywords — ${body.slug}`);
    return Response.json({ keywords: kw, emotion });
  }

  if (action === "regenMeta") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const artist = fmValue(fm, "artist");
    const lang = fmValue(fm, "lang") || "en";
    const auto = await computeAuto({
      title: fmValue(fm, "title"),
      artist,
      lyrics: originalLyrics(bodyText),
      lang,
      year: fmValue(fm, "year"),
      genre: fmValue(fm, "genre"),
    });
    // When Gemini is down (quota/503), computeAuto's tags fall back to the coarse
    // store genre + name-script country — worse than what's on disk. Refuse the
    // whole overwrite so a rate-limited run can't silently degrade good metadata.
    if (!auto.aiOk)
      return Response.json({ error: "AI 호출 실패 (쿼터·과부하) — 기존 메타 유지" }, { status: 502 });

    let out = raw;
    const updated = [];
    // tags = country · genre · year only. Overwrite fully so any legacy mood tags
    // are dropped and the year migrates from decade to exact.
    if (auto.tags.length) {
      out = setField(out, "tags", `[${auto.tags.join(", ")}]`, "year");
      updated.push("tags");
    }
    // 이 경로의 코멘트는 가사만 보고 쓴 것이다. 웹 조사로 출처까지 붙여 둔 코멘트를
    // 덮으면 근거가 사라지고 basis가 lyrics_only로 강등된다 — 되돌릴 수 없으므로 두고 간다.
    const keptWebComment = fmValue(fm, "comment_basis") === "web_enriched";
    if (auto.comment && !keptWebComment) {
      out = setCommentWithProvenance(out, auto.comment, "lyrics_only");
      updated.push("comment");
    }
    // title_ko: for ko songs computeAuto returns the title itself — skip that no-op
    if (auto.titleKo && auto.titleKo !== fmValue(fm, "title")) {
      out = setField(out, "title_ko", auto.titleKo, "title");
      updated.push("title_ko");
    }
    if (needsReading(artist) && auto.artistKo) {
      out = setField(out, "artist_ko", auto.artistKo, "artist");
      updated.push("artist_ko");
    }
    // keywords/emotion arrived after the first songs were filed, so this is
    // also their backfill path — anchor after tags, which every song has
    if (auto.keywords.length) {
      out = setField(out, "keywords", `[${auto.keywords.join(", ")}]`, "tags");
      updated.push("keywords");
    }
    if (auto.emotion) {
      // anchored on tags, not keywords — keywords may be absent and setField
      // silently drops the insert when its anchor is missing
      out = setField(out, "emotion", auto.emotion, "tags");
      updated.push("emotion");
    }
    if (!updated.length) return Response.json({ updated: [] });
    await writeSong(body.slug, out, `chore(song): regen metadata — ${body.slug}`);
    // 필드 이름만 돌려주면 코멘트가 무엇으로 바뀌었는지 화면에서 확인할 길이 없다.
    // 덮어쓰기라 되돌리려면 무엇이 사라졌는지도 보여야 한다.
    return Response.json({
      updated,
      comment: fmValue(out.match(FM)?.[1] || "", "comment"),
      previousComment: fmValue(fm, "comment"),
      keptWebComment,
    });
  }

  // Reclassify ONLY the genre (frontmatter `genre:` + the genre tag), leaving
  // comment/title_ko/artist_ko/lyrics untouched. This is the targeted fix behind
  // the lint tool's "장르 재생성" — cheaper and less destructive than regenMeta.
  if (action === "regenGenre") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const auto = await computeAuto({
      title: fmValue(fm, "title"),
      artist: fmValue(fm, "artist"),
      lyrics: originalLyrics(bodyText),
      lang: fmValue(fm, "lang") || "en",
      year: fmValue(fm, "year"),
      genre: fmValue(fm, "genre"),
    });
    // genre judgment needs the model — a store-genre fallback is what we're fixing
    if (!auto.aiOk)
      return Response.json({ error: "AI 호출 실패 (쿼터·과부하) — 기존 장르 유지" }, { status: 502 });
    const newGenre = genreTagOf(auto.tags);
    const old = genreTagOf((await getAllSongsRuntime()).find((x) => x.slug === body.slug)?.tags || []);
    // rewrite the whole tags line (country·genre·year) so the genre slot updates
    // in place, and sync the frontmatter genre field to match
    let out = setField(raw, "tags", `[${auto.tags.join(", ")}]`, "year");
    if (newGenre) out = setField(out, "genre", newGenre, "year");
    await writeSong(body.slug, out, `chore(song): regen genre — ${body.slug}`);
    return Response.json({ genre: newGenre, changed: newGenre !== old });
  }

  // Regenerate the comment from grounded web research. The same result carries
  // an appearance suggestion so the client can persist prose and structured
  // data together instead of letting them disagree again.
  if (action === "regenComment") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const research = await researchSongContext({
      key,
      title: fmValue(fm, "title"),
      artist: fmValue(fm, "artist"),
      album: fmValue(fm, "album"),
      year: fmValue(fm, "year"),
      genre: fmValue(fm, "genre"),
      lyrics: originalLyrics(bodyText),
      commentHint: fmValue(fm, "comment"),
    });
    // 그라운딩 한도가 소진돼도 일반 생성은 살아 있다 — 메타 재생성이 그 경로로 코멘트를
    // 만들어 내는데 이 버튼만 죽어 있으면 앞뒤가 맞지 않는다. 가사만 보고 쓴 코멘트로
    // 내려앉되, 이미 웹 근거가 붙은 코멘트는 덮지 않는다. 그건 되돌릴 수 없다.
    if (!research) {
      const reason = withReason("코멘트 웹 리서치를 완료하지 못했습니다");
      if (fmValue(fm, "comment_basis") === "web_enriched")
        return Response.json({ error: `${reason} 기존 웹 근거 코멘트를 지키기 위해 덮어쓰지 않았습니다.` }, { status: 503 });
      const auto = await computeAuto({
        title: fmValue(fm, "title"),
        artist: fmValue(fm, "artist"),
        lyrics: originalLyrics(bodyText),
        lang: fmValue(fm, "lang") || "en",
        year: fmValue(fm, "year"),
        genre: fmValue(fm, "genre"),
      });
      if (!auto.comment) return Response.json({ error: reason }, { status: 503 });
      const fallback = setCommentWithProvenance(raw, auto.comment, "lyrics_only");
      await writeSong(body.slug, fallback, `chore(song): regen comment (lyrics only) — ${body.slug}`);
      return Response.json({
        comment: auto.comment,
        previousComment: fmValue(fm, "comment"),
        commentSources: [],
        commentBasis: "lyrics_only",
        degraded: reason,
      });
    }
    const comment = research.comment;
    if (!comment)
      return Response.json({ error: research.warning || "검증 가능한 코멘트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요" }, { status: 422 });
    const sourceUrls = research.commentSources.map((source) => source.uri);
    const next = setCommentWithProvenance(raw, comment, research.commentBasis || "lyrics_only", sourceUrls);
    await writeSong(body.slug, next, `chore(song): regen comment — ${body.slug}`);
    return Response.json({
      previousComment: fmValue(fm, "comment"),
      comment,
      commentBasis: research.commentBasis,
      commentSources: research.commentSources,
      researchWarning: research.warning,
      appearanceSuggestion: research.appearance,
    });
  }

  // Add the "> " translation line to each lyric line — used to give a Korean song
  // the same two-line layout as EN/JA songs. Only runs when translation is absent,
  // so it never clobbers a song's existing (hand-edited) translation.
  if (action === "addTranslation") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    if (/^\s*>/m.test(bodyText))
      return Response.json({ error: "이미 번역이 있는 곡입니다" }, { status: 409 });
    const lang = fmValue(fm, "lang") || "ko";
    const translated = await translateLyrics(key, {
      title: fmValue(fm, "title"),
      artist: fmValue(fm, "artist"),
      lang,
      lyrics: originalLyrics(bodyText),
    });
    if (!translated) return Response.json({ error: "번역 생성 실패" }, { status: 502 });
    await writeSong(
      body.slug,
      `---\n${fm}\n---\n${translated.trim()}\n`,
      `chore(song): add translation — ${body.slug}`
    );
    return Response.json({ ok: true });
  }

  // Stanza notes (`// …`). Two ways in: Gemini drafts them for the stanzas that
  // carry the song's weight (regenNotes), and the song page saves a hand-written
  // one for a single stanza (setNote). Both rewrite only the `//` lines.
  if (action === "regenNotes" || action === "setNote") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;

    // blocks match lib/songs.js stanzas: blank-line separated, `//` lines are the note
    const blocks = bodyText.trim().split(/\n\s*\n/).map((b) => b.split("\n"));
    const putNote = (i, note) => {
      const keep = blocks[i].filter((l) => !/^\s*\/\//.test(l));
      blocks[i] = note ? [...keep, `// ${note}`] : keep;
    };
    const commit = (msg) =>
      writeSong(body.slug, `---\n${fm}\n---\n${blocks.map((b) => b.join("\n")).join("\n\n")}\n`, msg);

    if (action === "setNote") {
      const i = Math.floor(body.index);
      if (!(i >= 0 && i < blocks.length))
        return Response.json({ error: "연 번호가 범위를 벗어남" }, { status: 422 });
      const note = String(body.note || "").replace(/\s*\n+\s*/g, " ").trim().slice(0, 400);
      putNote(i, note);
      await commit(`chore(song): ${note ? "edit" : "remove"} note — ${body.slug} #${i}`);
      return Response.json({ note });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const listed = blocks
      .map((b, i) => {
        const lines = b.filter((l) => !/^\s*(>|\+|\/\/|\[)/.test(l) && l.trim());
        return `[${i}] ${lines.join(" / ")}`;
      })
      .join("\n");
    const rawJson = await geminiText(
      key,
      `노래 "${fmValue(fm, "title")}" (${fmValue(fm, "artist")})의 연 목록이다.
곡 전체에서 의미가 가장 깊은 연 2~3개만 골라 해설 노트를 써라.
JSON 배열로만 답하라: [{"index":0,"note":"..."}]
- index: 아래 대괄호 안의 연 번호.
- note: 그 연의 표현·비유·곡 안에서의 역할을 짚는 해설 1~2문장. 반드시 평서문 '~다'체. 가사를 그대로 옮겨 적지 말 것.
${listed}`,
      true
    );
    let notes;
    try {
      notes = JSON.parse(rawJson.replace(/^```json\s*|\s*```$/g, "").trim());
    } catch {
      return Response.json({ error: "해설 생성 실패" }, { status: 502 });
    }
    const applied = (Array.isArray(notes) ? notes : []).filter(
      (n) => Number.isInteger(n?.index) && n.index >= 0 && n.index < blocks.length && n.note
    );
    if (!applied.length) return Response.json({ error: "해설 생성 실패" }, { status: 502 });
    for (const n of applied)
      putNote(n.index, String(n.note).replace(/\s*\n+\s*/g, " ").trim().slice(0, 400));
    await commit(`chore(song): regen notes — ${body.slug}`);
    return Response.json({ notes: applied.length });
  }

  // Re-stanza one stored song on demand (the manual admin tool). The core logic
  // lives in restanzaBody, shared with the auto-restanza on save.
  if (action === "restanza") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const newBody = await restanzaBody({
      title: fmValue(fm, "title"),
      artist: fmValue(fm, "artist"),
      bodyText,
      key,
    });
    if (!newBody)
      return Response.json({ error: "연 정리 실패 — 가사가 짧거나 구조가 안 맞음" }, { status: 502 });
    await writeSong(body.slug, `---\n${fm}\n---\n${newBody}\n`, `chore(song): restanza — ${body.slug}`);
    return Response.json({ stanzas: newBody.split("\n\n").length });
  }

  // ── 대량 작업 (Claude·ChatGPT) ────────────────────────────────────────────
  // Gemini 무료 티어로는 768곡을 훑을 수 없다. 그래서 역할을 나눈다:
  //   소량(Gemini): 새 곡 하나를 넣을 때의 번역·독음·코멘트 — 기존 버튼 그대로
  //   대량(Claude·ChatGPT): 전 곡 대상 작업 — 여기서 '무엇이 부족한지' 목록만 만들고
  //     실제 문장은 밖에서 채워 온다. 채워 온 결과는 bulkApply가 검증하고 쓴다.
  // 이 경로는 외부 API를 한 번도 부르지 않는다.
  if (action === "bulkPlan") {
    const field = body.field || "";           // keywords|emotion|comment|title_ko|reading|genre|year|artwork
    const limit = Math.min(Number(body.limit) || 500, 2000);
    const songs = await getAllSongsRuntime();
    const rows = [];
    for (const s of songs) {
      const n = songNeeds(s);
      const want =
        field === "keywords" ? n.keywords :
        field === "emotion" ? n.emotion :
        field === "comment" ? n.comment :
        field === "title_ko" ? n.titleKo :
        field === "reading" ? n.reading :
        field === "genre" ? (n.genre ? 1 : 0) :
        field === "year" ? n.year :
        field === "artwork" ? n.artwork :
        summarizeNeeds(s).length; // field 미지정이면 뭐라도 부족한 곡
      if (!want) continue;
      rows.push({
        slug: s.slug, title: s.title, artist: s.artist, lang: s.lang,
        year: s.year || "", genre: s.genre || "", album: s.album || "",
        needs: summarizeNeeds(s),
      });
      if (rows.length >= limit) break;
    }
    return Response.json({ field: field || "any", count: rows.length, total: songs.length, items: rows });
  }

  // Gemini는 '무엇부터 손볼지' 고르는 데만 쓴다 — 원문 전체를 주지 않고
  // 요약된 목록(제목·아티스트·부족 항목)만 넘긴다. 무료 티어 호출 한 번 분량이다.
  if (action === "bulkPriority") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 300);
    if (!items.length) return Response.json({ error: "items가 비어 있습니다" }, { status: 422 });
    const pick = Math.min(Number(body.pick) || 20, 60);
    const lines = items
      .map((it, i) => `${i + 1}. ${it.artist || ""} — ${it.title || ""} [${(it.needs || []).join(", ")}]`)
      .join("\n");
    const prompt =
      `아래는 개인 음악 아카이브에서 메타데이터가 부족한 곡 목록이다. ` +
      `이 중 먼저 손봐야 할 ${pick}곡의 번호만 고르라. ` +
      `기준: 컬렉션에서 자주 보이는 아티스트, 대표곡, 부족한 항목이 많은 곡을 앞에 둔다. ` +
      `설명 없이 번호만 쉼표로 출력한다.\n\n${lines}`;
    const raw = await geminiText(key, prompt, false, GEMINI_LITE_MODEL);
    const idx = String(raw || "").match(/\d+/g)?.map(Number) || [];
    const chosen = [...new Set(idx)].filter((n) => n >= 1 && n <= items.length).slice(0, pick).map((n) => items[n - 1]);
    return Response.json({ picked: chosen.length, items: chosen });
  }

  // 밖에서 채워 온 결과를 검증하고 쓴다. 닫힌 어휘(감정·장르·국가)를 벗어난 값,
  // 4자리가 아닌 연도, https가 아닌 커버는 받지 않는다 — 대량 작업일수록
  // 잘못된 값 하나가 조용히 768곡에 섞인다.
  if (action === "bulkApply") {
    const items = Array.isArray(body.items) ? body.items : [];
    const shouldApply = body.apply === true;
    if (!items.length) return Response.json({ error: "items가 비어 있습니다" }, { status: 422 });
    const bySlug = new Map((await getAllSongsRuntime()).map((s) => [s.slug, s]));
    const applied = [], rejected = [], pending = [];
    for (const it of items.slice(0, 1000)) {
      const song = bySlug.get(it.slug);
      if (!song) { rejected.push({ slug: it.slug, why: "없는 곡" }); continue; }
      const stored = await readSong(it.slug);
      if (!stored) { rejected.push({ slug: it.slug, why: "파일 없음" }); continue; }
      let raw = stored.raw.replace(/\r\n/g, "\n");
      const fm = raw.match(FM)?.[1];
      if (!fm) { rejected.push({ slug: it.slug, why: "frontmatter 없음" }); continue; }
      const changed = [];

      if (it.emotion !== undefined) {
        const e = parseEmotion(it.emotion);
        if (!e) rejected.push({ slug: it.slug, why: `감정이 목록 밖: ${it.emotion}` });
        else if (!fmValue(fm, "emotion") || body.overwrite) { raw = setField(raw, "emotion", e, "keywords"); changed.push("emotion"); }
      }
      if (it.keywords !== undefined) {
        const kw = parseKeywords(Array.isArray(it.keywords) ? it.keywords.join(", ") : it.keywords);
        if (kw.length && (!fmValue(fm, "keywords") || fmValue(fm, "keywords") === "[]" || body.overwrite)) {
          raw = setField(raw, "keywords", `[${kw.join(", ")}]`, "tags");
          changed.push("keywords");
        }
      }
      if (it.comment !== undefined && String(it.comment).trim()) {
        const c = String(it.comment).trim().replace(/\s+/g, " ");
        if (/(습니다|합니다|해요)\.?$/.test(c)) rejected.push({ slug: it.slug, why: "코멘트 문체(~다체 아님)" });
        else if (!fmValue(fm, "comment") || body.overwrite) { raw = setCommentWithProvenance(raw, c, "manual"); changed.push("comment"); }
      }
      if (it.title_ko !== undefined && String(it.title_ko).trim() && (!fmValue(fm, "title_ko") || body.overwrite)) {
        raw = setField(raw, "title_ko", String(it.title_ko).trim(), "title");
        changed.push("title_ko");
      }
      if (it.genre !== undefined && String(it.genre).trim()) {
        const g = capGenre(it.genre);
        if (!GENRES.includes(g)) rejected.push({ slug: it.slug, why: `장르가 목록 밖: ${it.genre}` });
        else { raw = setField(raw, "genre", g, "duration"); changed.push("genre"); }
      }
      if (it.year !== undefined && String(it.year).trim()) {
        if (!/^\d{4}$/.test(String(it.year))) rejected.push({ slug: it.slug, why: `연도가 4자리가 아님: ${it.year}` });
        else if (!fmValue(fm, "year") || body.overwrite) { raw = setField(raw, "year", String(it.year), "album"); changed.push("year"); }
      }
      if (it.artwork !== undefined && String(it.artwork).trim()) {
        if (!/^https:\/\//.test(it.artwork)) rejected.push({ slug: it.slug, why: "커버가 https가 아님" });
        else if (!(fmValue(fm, "artwork") || "").startsWith("https") || body.overwrite) { raw = setField(raw, "artwork", String(it.artwork), "year"); changed.push("artwork"); }
      }
      // 태그의 국가·장르·연도 세 자리는 값이 바뀌면 같이 맞춘다
      if (changed.includes("genre") || changed.includes("year")) {
        const tags = (fmValue(raw.match(FM)[1], "tags") || "").replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean);
        const country = tags.find((t) => COUNTRY_TAGS.includes(t)) || "";
        const g2 = fmValue(raw.match(FM)[1], "genre");
        const y2 = fmValue(raw.match(FM)[1], "year");
        raw = setField(raw, "tags", `[${[country, g2, y2].filter(Boolean).join(", ")}]`, "lang");
      }

      if (!changed.length) continue;
      // 곡마다 커밋하지 않고 모아 둔다 — 아래에서 한 커밋으로 나간다
      pending.push({ path: `songs/${it.slug}.md`, content: raw });
      applied.push({ slug: it.slug, changed });
    }
    const fields = [...new Set(applied.flatMap((a) => a.changed))];
    if (shouldApply && pending.length)
      await commitFiles(
        pending,
        `chore(song): bulk ${fields.join(",")} — ${applied.length}곡`
      );
    return Response.json({
      applied: shouldApply ? applied.length : 0,
      changeCount: applied.length,
      changes: applied,
      rejected,
      fields,
      preview: !shouldApply,
    });
  }

  if (action === "load") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    return Response.json({ raw: song.raw, translationVariants: variantsFromRaw(song.raw) });
  }

  // ── 가사 정확성 감사 ──────────────────────────────────────────────────────
  // 무손실 검증은 "인스타에 적힌 그대로냐"만 본다. 인스타에 처음부터 있던 오타나
  // 잘못 들은 단어는 잡히지 않는다. 여기서 고치되 근거를 남긴다 —
  // source_hash는 계속 인스타 원본을 가리키고, 달라진 줄만 교정 이력에 기록한다.
  if (action === "auditQueue") {
    const items = (await readRuntimeData(CORRECTIONS_FILE, { items: [] })).items || [];
    const done = new Set(items.map((c) => c.slug));
    const songs = await getAllSongsRuntime();
    const risky = songs.map((s) => {
      const lines = s.stanzas.flatMap((st) => st.lines);
      const reasons = [];
      // 가사 자체가 없는 곡 — 여기 목록에 띄워야 사람이 직접 붙여넣을 수 있다.
      // 연주곡과 '어디에도 원문이 없다'고 확인해 둔 곡(lyrics_none)은 제외한다.
      if (!s.instrumental && !s.lyrics_none && !lines.some((l) => l.en?.trim() || l.ko?.trim()))
        reasons.push("가사 없음");
      if (/댓글\s*병합/.test(s.source_note || "")) reasons.push("댓글에서 복원");
      if (lines.some((l) => l.koSpan > 1)) reasons.push("병합 번역");
      if (lines.length >= 60) reasons.push("긴 캡션");
      if (s.lang === "ko" && lines.some((l) => l.ko)) reasons.push("Claude 영어 번역");
      if (s.lang === "ja") reasons.push("일본어");
      return {
        slug: s.slug, title: s.title, artist: s.artist, lang: s.lang,
        lines: lines.length, reasons,
        verifiedAt: s.lyrics_verified_at || "",
        reviewed: done.has(s.slug),
      };
    });
    // 위험도 높은 순 — 사용자가 준 순서를 그대로 점수로 쓴다
    const rank = (r) => (r.includes("가사 없음") ? 10 : 0) +
      (r.includes("댓글에서 복원") ? 6 : 0) + (r.includes("병합 번역") ? 5 : 0) +
      (r.includes("긴 캡션") ? 4 : 0) + (r.includes("Claude 영어 번역") ? 3 : 0) + (r.includes("일본어") ? 2 : 0);
    risky.sort((a, b) => rank(b.reasons) - rank(a.reasons) || b.lines - a.lines);
    const songNames = new Map(songs.map((song) => [song.slug, { title: song.title, artist: song.artist }]));
    const evidenceItems = correctionEvidenceRows(items)
      .filter((item) => item.evidenceState !== "documented")
      .map((item) => ({ ...item, ...(songNames.get(item.slug) || {}) }));
    return Response.json({
      items: risky.filter((r) => r.reasons.length && !r.verifiedAt).slice(0, 200),
      total: songs.length,
      evidence: { summary: correctionEvidenceSummary(items), items: evidenceItems },
    });
  }

  if (action === "auditSong") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const items = correctionEvidenceRows((await readRuntimeData(CORRECTIONS_FILE, { items: [] })).items || [])
      .filter((c) => c.slug === body.slug);
    const raw = song.raw.replace(/\r\n/g, "\n");
    return Response.json({ raw, corrections: items });
  }

  // 기존 교정 기록의 근거 URL만 보완한다. 본문과 해시는 건드리지 않으며,
  // append-only 장부에서 계산한 식별자로 정확한 한 항목만 갱신한다.
  if (action === "auditEvidenceSave") {
    const evidenceId = String(body.evidenceId || "");
    const sourceUrl = String(body.sourceUrl || "").trim();
    if (correctionEvidenceState({ sourceUrl }) !== "documented")
      return Response.json({ error: "http 또는 https 근거 URL이 필요합니다" }, { status: 422 });
    const store = await readRuntimeData(CORRECTIONS_FILE, { items: [] });
    const list = store.items || [];
    const rows = correctionEvidenceRows(list);
    const index = rows.findIndex((item) => item.evidenceId === evidenceId);
    if (index < 0) return Response.json({ error: "교정 기록을 찾을 수 없습니다" }, { status: 404 });
    list[index] = { ...list[index], sourceUrl, evidenceReviewedAt: new Date().toISOString() };
    await commitFiles([{
      path: `data/${CORRECTIONS_FILE}`,
      content: `${JSON.stringify({ items: list, at: new Date().toISOString() }, null, 1)}\n`,
    }], `docs(lyrics): add correction evidence — ${list[index].slug}`);
    return Response.json({ ok: true, evidenceId, sourceUrl, evidenceState: "documented" });
  }

  // 한 곡의 검토 결과 저장 — 본문을 바꿨으면 바뀐 줄마다 근거가 있어야 한다
  if (action === "auditSave") {
    const { slug, raw, corrections = [], verifiedAt, source } = body;
    const song = await readSong(slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const before = song.raw.replace(/\r\n/g, "\n");
    const after = (raw || "").replace(/\r\n/g, "\n");
    const changed = before !== after;
    if (changed && !corrections.length)
      return Response.json({ error: "본문을 바꾸려면 교정 사유가 필요합니다" }, { status: 422 });
    for (const c of corrections) {
      if (!CORRECTION_TYPES.includes(c.type))
        return Response.json({ error: `교정 종류가 목록 밖: ${c.type}` }, { status: 422 });
      if (!String(c.reason || "").trim())
        return Response.json({ error: "교정 사유(reason)가 비어 있습니다" }, { status: 422 });
      if (correctionEvidenceState({ sourceUrl: c.sourceUrl }) !== "documented")
        return Response.json({ error: "교정 근거 URL이 필요합니다" }, { status: 422 });
    }
    let out = after;
    if (verifiedAt) {
      if (!/^https?:\/\//.test(source || ""))
        return Response.json({ error: "확인 근거 URL이 필요합니다" }, { status: 422 });
      out = setField(out, "lyrics_verified_at", verifiedAt, "published");
      out = setField(out, "lyrics_source", source, "lyrics_verified_at");
    }
    // 곡 본문과 교정 이력은 한 저장에서 함께 바뀐다 — 커밋도 하나로 묶는다.
    // 따로 쓰면 배포가 두 번 돌고, 그 사이 이력 없는 본문이 잠깐 배포된다.
    const writes = [];
    if (out !== before) writes.push({ path: `songs/${slug}.md`, content: out });

    if (corrections.length) {
      const store = await readRuntimeData(CORRECTIONS_FILE, { items: [] });
      const list = store.items || [];
      for (const c of corrections)
        list.push({
          slug,
          type: c.type,
          field: c.field === "translation" ? "translation" : "original",
          lineIndex: Number(c.lineIndex ?? -1),
          beforeHash: lineHash(c.before ?? ""),
          afterHash: lineHash(c.after ?? ""),
          reason: String(c.reason).trim(),
          sourceUrl: String(c.sourceUrl || "").trim(),
          reviewedAt: new Date().toISOString(),
        });
      writes.push({
        path: `data/${CORRECTIONS_FILE}`,
        // 들여쓰기 1칸은 data/*.json 전체가 쓰는 형식이다 — 바꾸면 diff가 통째로 뜬다
        content: `${JSON.stringify({ items: list, at: new Date().toISOString() }, null, 1)}\n`,
      });
    }
    if (writes.length) await commitFiles(writes, `fix(lyrics): audit — ${slug}`);
    return Response.json({ ok: true, changed: out !== before, corrections: corrections.length });
  }

  if (action === "update") {
    if (!(await readSong(body.slug)))
      return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    await writeSong(body.slug, body.raw, `edit(song): ${body.slug}`);
    return Response.json({ ok: true, translationVariants: variantsFromRaw(body.raw) });
  }

  if (action === "delete") {
    await deleteSong(body.slug);
    return Response.json({ ok: true });
  }

  if (action === "mergeDuplicate") {
    const canonicalSlug = String(body.canonicalSlug || "").trim();
    const duplicateSlug = String(body.duplicateSlug || "").trim();
    const [canonical, duplicate] = await Promise.all([readSong(canonicalSlug), readSong(duplicateSlug)]);
    if (!canonical?.raw || !duplicate?.raw)
      return Response.json({ error: "병합할 곡을 찾을 수 없습니다" }, { status: 404 });
    const canonicalMeta = parseFrontmatter(canonical.raw).meta;
    const duplicateMeta = parseFrontmatter(duplicate.raw).meta;
    const match = findDuplicateSong(
      { ...duplicateMeta, slug: duplicateSlug },
      [{ ...canonicalMeta, slug: canonicalSlug }],
      { excludeSlug: duplicateSlug }
    );
    if (!match) return Response.json({ error: "두 기록이 같은 곡이라는 근거가 없습니다" }, { status: 422 });

    const merged = mergeDuplicateSongDocuments(canonical.raw, duplicate.raw, { canonicalSlug, duplicateSlug });
    const appearances = await readRuntimeData("song-appearances.json", { version: 1, items: [] });
    let movedAppearances = 0;
    const mappedAppearances = (appearances.items || []).map((item) => {
      if (item.songSlug !== duplicateSlug) return item;
      movedAppearances += 1;
      return { ...item, songSlug: canonicalSlug, updatedAt: new Date().toISOString() };
    });
    const seenAppearances = new Set();
    let dedupedAppearances = 0;
    const nextAppearances = {
      ...appearances,
      updatedAt: new Date().toISOString(),
      items: mappedAppearances.filter((item) => {
        const identity = appearanceIdentity(item);
        if (seenAppearances.has(identity)) { dedupedAppearances += 1; return false; }
        seenAppearances.add(identity);
        return true;
      }),
    };
    await commitFiles([
      { path: `songs/${canonicalSlug}.md`, content: merged.canonicalRaw },
      { path: `songs/${duplicateSlug}.md`, content: merged.duplicateRaw },
      ...(movedAppearances ? [{ path: "data/song-appearances.json", content: `${JSON.stringify(nextAppearances, null, 1)}\n` }] : []),
    ], `fix(song): merge duplicate ${duplicateSlug} into ${canonicalSlug}`);
    return Response.json({ ok: true, canonicalSlug, duplicateSlug, copied: merged.copied, movedAppearances, dedupedAppearances });
  }

  if (action === "save") {
    const { title, titleKo, artist, artistKo, album, year, artwork, lang, tags, comment, lyrics, preview, trackId, duration, genre, keywords, emotion, external_url } = body;
    const sourceUrls = commentSourceUrls(body.commentSources);
    const commentBasis = ["lyrics_only", "web_enriched", "manual"].includes(body.commentBasis) ? body.commentBasis : "manual";
    const slug = `${artist} ${title}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
      .replace(/^-|-$/g, "");
    const duplicate = findDuplicateSong({ title, artist, trackId }, await getAllSongsMeta());
    if (duplicate && body.allowDuplicate !== true) {
      return Response.json({
        error: `이미 등록된 곡입니다: ${duplicate.artist} — ${duplicate.title}`,
        duplicate,
      }, { status: 409 });
    }
    // 가사가 어디에도 없는 곡. 데이터 모델은 처음부터 lyrics_none을 읽고 있었지만
    // (needs.js가 이 표시를 보고 번역·독음·키워드 대기열에서 빼 준다) 관리자 화면에
    // 그 표시를 세울 길이 없어서, 가사를 못 구한 곡은 아예 등록조차 되지 않았다.
    const isInstrumental = body.instrumental === true || body.instrumental === "true";
    const lyricsUnavailable = body.lyricsNone === true || body.lyricsNone === "true";
    const noLyrics = isInstrumental || lyricsUnavailable;

    // catches the paths that skip translation: a hand-typed body, and the
    // "이대로 사용" bypass that copies Korean lyrics over verbatim
    let lyricBody = capitalizeLyricLines(String(lyrics || "").trim());
    // 등록 시 섹션 자동 부여. 예전에는 "예외만 수동으로 연 다시 나누기"였지만,
    // 소스 가사에 섹션이 없는 곡이 반복해서 그대로 등록됐다(浸食 ~lose control~ 등
    // 850곡을 사후 일괄 처리해야 했다). 이제 [헤더]가 하나도 없는 가사는 저장 때
    // Gemini lite로 구조를 판정해 붙인다. restanzaBody는 원문 줄을 재배열만 하므로
    // 내용은 바이트 단위로 보존되고, 실패하면 입력 그대로 저장한다 — 레이아웃은
    // 장식이라 등록을 막지 않는다(requalityApply와 같은 원칙).
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && !noLyrics && lyricBody && !/^\[[^\]]+\]\s*$/m.test(lyricBody)) {
      try {
        const restanza = await restanzaBody({ title, artist, bodyText: lyricBody, key: geminiKey });
        if (restanza) lyricBody = restanza;
      } catch {}
    }
    const md = `---
title: ${title}
title_ko: ${titleKo || (lang === "ko" ? title : "")}
artist: ${artist}
artist_ko: ${artistKo || ""}
album: ${album || ""}
year: ${year || ""}
genre: ${capGenre(genre) || ""}
artwork: ${artwork || ""}
preview: ${preview || ""}
trackId: ${trackId || ""}
external_url: ${external_url || ""}
duration: ${duration || ""}
lang: ${lang}
tags: [${(tags || "").split(",").map((t) => capGenre(t.trim())).filter(Boolean).join(", ")}]
keywords: [${parseKeywords(keywords).join(", ")}]
emotion: ${parseEmotion(emotion)}
date: ${kstToday()}
published: ${new Date().toISOString()}
comment: ${(comment || "").replace(/\s*\n+\s*/g, " ")}
comment_basis: ${commentBasis}
comment_sources: [${sourceUrls.join(", ")}]
${isInstrumental ? "instrumental: true\n" : ""}${lyricsUnavailable ? `lyrics_none: true\nlyrics_note: ${String(body.lyricsNote || "").replace(/\s*\n+\s*/g, " ")}\n` : ""}---
${lyricBody}
`;
    const appearanceAudit = await readRuntimeData("song-appearance-exhaustive.json", {});
    const enrollment = enrollAppearanceCheckpoint(appearanceAudit, { slug, title, artist });
    await commitFiles([
      { path: `songs/${slug}.md`, content: md },
      ...(enrollment.added ? [{
        path: "data/song-appearance-exhaustive.json",
        content: `${JSON.stringify(enrollment.audit, null, 1)}\n`,
      }] : []),
    ], `add(song): ${slug}`);
    return Response.json({ slug });
  }

  // 음악 취향 AI 리포트 — 영화 tasteReport의 음악판. 집계 요약을 Gemini에
  // 넘겨 3~4문단 해석을 받아 저장한다. /songs/taste 상단에 표시되고,
  // songRecs가 추천 프롬프트에 이 리포트를 함께 넣는다.
  if (action === "musicReport") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const songs = await getAllSongsRuntime();
    if (songs.length < 10)
      return Response.json({ error: `곡이 ${songs.length}곡뿐입니다 (10곡 이상 필요)` }, { status: 422 });

    const t = summarizeMusicTaste(songs);
    const fmt = (rows) => rows.map(([k, n]) => `${k} ${n}곡`).join(", ");
    const lines = [
      `총 ${t.count}곡 · 아티스트 ${t.artist.length}팀 (${t.once.length}팀은 한 곡만)`,
      `국가·권역: ${fmt(t.region)}`,
      `장르: ${fmt(t.genre)}`,
      `연대: ${fmt(t.decade)}`,
      `많이 담은 아티스트: ${fmt(t.artist.slice(0, 15))}`,
      `감정: ${fmt(t.emotion)} (밝음↔어두움 기울기 ${t.valenceMean.toFixed(1)}, -3~+3)`,
      `가사 키워드: ${t.keywords.slice(0, 15).map(([k]) => k).join(", ")}`,
    ].join("\n");

    const text = await geminiText(
      key,
      `아래는 한 사람이 가사 번역 블로그에 모아온 곡들의 집계다. 별점·재생 기록은 없고
'직접 골라 담았다'는 사실 자체가 취향의 기록이다.
이 사람의 음악 취향을 분석하는 리포트를 한국어로 써라.
- 3~4개 문단, 각 문단 2~3문장. 소제목 없이 이어지는 산문
- 장르·연대·감정·키워드가 서로 어떻게 얽히는지 교차 해석하라 (예: 어떤 장르에 어떤 감정이 몰리는지)
- 구체적 근거(장르/연대/감정과 곡 수)를 문장에 녹여라
- 반복해 담은 아티스트와 한 곡씩 발견한 아티스트의 비율이 말해주는 수집 성향도 짚어라
- 단정적 분석 톤, 평서문 '~다'체. "~습니다/~해요" 금지. 과장·아부 금지
- 마지막 문단은 이 취향이 다음에 파고들 만한 방향을 한 문장으로 제안
집계:
${lines}`,
      false,
      undefined,
      // 3~4문단 산문은 기본 12초 안에 안 끝난다 — 좋은 모델부터 차례로 잘려
      // 나가고 lite 모델만 남거나, 그마저 늦으면 리포트 자체가 실패한다.
      { timeoutMs: LONG_FORM_TIMEOUT_MS }
    );
    if (!text) return Response.json({ error: "리포트 생성 실패 (쿼터·과부하)" }, { status: 502 });

    const report = { text: text.trim(), count: t.count, at: new Date().toISOString() };
    const previous = await readRuntimeData("music-report.json", null);
    const stored = appendReportVersion(previous, report);
    await writeData("music-report.json", JSON.stringify(stored, null, 1), `data: 음악 취향 리포트 (${t.count}곡)`);
    return Response.json(stored);
  }

  // 가사 구간 — 20줄 넘는 가사가 한 덩어리로 들어오는 일이 반복돼, 그때마다
  // 사람이 md를 직접 고치다 줄을 지우거나 순서를 흐트러뜨릴 여지가 있었다.
  // 여기서는 좌표(원문 몇 번째 줄)만 받고, 삽입 결과를 원문과 대조해 다르면 거절한다.
  if (action === "sectionPlan") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const m = song.raw.replace(/\r\n/g, "\n").match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    return Response.json({ slug: body.slug, lines: originalLines(m[2]) });
  }

  if (action === "sectionApply") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const marks = Array.isArray(body.marks) ? body.marks : [];
    let next;
    try {
      next = applySections(m[2], marks, { tighten: body.tighten === true });
    } catch (error) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    if (next === m[2]) return Response.json({ slug: body.slug, sections: 0, changed: false });
    // 프론트매터는 손대지 않는다 — source_hash가 여기 있다.
    const out = `---
${m[1]}
---
${next}`;
    await writeSong(body.slug, out, `chore(song): sections — ${body.slug}`);
    return Response.json({ slug: body.slug, sections: marks.filter((mark) => mark.section).length, changed: true });
  }

  // 장르 — genre: 필드와 tags 안의 장르는 서로 다른 곳을 보는 두 값이라,
  // 한쪽만 고치면 화면 문구와 결손 판정이 어긋난 채 남는다. 함께 쓴다.
  if (action === "genreApply") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    let out;
    try {
      out = applyGenre(song.raw, body.genre);
    } catch (error) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    const before = song.raw.replace(/\r\n/g, "\n");
    if (out === before) return Response.json({ slug: body.slug, genre: body.genre, changed: false });
    await writeSong(body.slug, out, `chore(song): genre ${body.genre} — ${body.slug}`);
    return Response.json({ slug: body.slug, genre: body.genre, changed: true, status: genreStatus(out) });
  }

  // 커버 수동 지정 — /admin의 커버 검토 화면에서 URL을 직접 입력하거나
  // '커버 없음'을 확정한다. URL은 https + image/* 응답을 서버에서 검증.
  if (action === "setArtwork") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    let raw = song.raw.replace(/\r\n/g, "\n");
    if (body.none) {
      raw = setField(raw, "artwork_none", "true", "artwork");
      await writeSong(body.slug, raw, `chore(song): 커버 없음 확정 — ${body.slug}`);
      return Response.json({ ok: true, none: true });
    }
    const url = String(body.artwork || "").trim();
    if (!/^https:\/\/\S+$/.test(url)) return Response.json({ error: "https URL이 아닙니다" }, { status: 422 });
    try {
      const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-2047" } });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !/^image\//.test(type))
        return Response.json({ error: `이미지가 아닙니다 (${res.status} ${type})` }, { status: 422 });
    } catch {
      return Response.json({ error: "이미지 응답 확인 실패" }, { status: 422 });
    }
    raw = setField(raw, "artwork", url, "year");
    await writeSong(body.slug, raw, `chore(song): 커버 수동 지정 — ${body.slug}`);
    return Response.json({ ok: true });
  }

  // 가사 모티프 지도 — 번역된 전체 가사에서 반복되는 이미지·주제를 묶는다.
  // 단어 빈도(keywords)보다 한 층 깊게: '밤·새벽·어둠·불 꺼진 방'이 하나의
  // 모티프가 된다. 구절은 실제 가사에 있는 것만 통과(환각 차단).
  if (action === "motifs") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const songs = await getAllSongsRuntime();
    if (songs.length < 10)
      return Response.json({ error: `곡이 ${songs.length}곡뿐입니다 (10곡 이상 필요)` }, { status: 422 });

    // 곡별 압축 요약 — 전체 가사 대신 keywords·감정·코멘트·대표 3줄만.
    // 곡이 늘어도 요청 크기가 선형으로 완만하고, 긴 가사 한 곡이 결과를
    // 지배하지 않는다. quote 검증은 전체 가사를 대조한다(아래).
    // 한국어 텍스트만: ko 곡은 원문(l.en 자리), 그 외는 한글 번역(l.ko).
    // 원문에 영어 라인이 섞인 한국어 곡(검정치마 등)도 있어 한글 포함 줄만 남긴다.
    const koOf = (s) =>
      s.stanzas
        .flatMap((st) => st.lines.map((l) => (s.lang === "ko" ? l.en : l.ko)))
        .filter((t) => t && /[가-힣]/.test(t));
    const corpus = songs
      .map((s) => {
        const lines = koOf(s).slice(0, 3).join(" / ");
        return `[${s.slug}] ${s.title} - ${s.artist} | 감정: ${parseEmotion(s.emotion) || "?"} | 키워드: ${(s.keywords || []).join(",") || "?"}\n대표 구절: ${lines.slice(0, 200)}`;
      })
      .join("\n");

    const raw = await geminiText(
      key,
      `아래는 한 사람이 모아온 ${songs.length}곡의 요약(감정·키워드·대표 구절)이다.
컬렉션 전체에서 반복되는 이미지·주제를 모티프 5~8개로 묶어라. JSON 배열로만:
[{"name":"밤과 어둠","description":"모티프를 한 문장으로","keywords":["밤","새벽","어둠"],"songs":[{"slug":"대괄호 안 slug 그대로","quote":"그 곡의 대표 구절에서 그대로 복사 (한 줄 이내)"}]}]
규칙:
- name은 2~8자 짧은 이름. 의미가 비슷한 표현('밤','새벽','불 꺼진 방')은 하나의 모티프로
- keywords는 이 모티프를 이루는 단어 2~5개
- 모티프당 곡 2~10개, 한 곡은 최대 3개 모티프까지. quote는 위 요약에 실제로 있는 구절만 — 지어내지 말 것
- 순수 JSON만 출력
곡 요약:
${corpus}`,
      true
    );
    let motifs;
    try {
      motifs = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
    } catch {
      return Response.json({ error: "모티프 생성 실패 (응답 파싱)" }, { status: 502 });
    }

    // 검증 — slug는 실존 곡만, quote는 그 곡 '전체 가사'에 실제로 있는 것만,
    // 곡당 최대 3개 모티프(초과분은 뒤 모티프에서 탈락)
    const bySlug = new Map(songs.map((s) => [s.slug, koOf(s).join("\n")]));
    const squash = (t) => String(t || "").replace(/\s+/g, "");
    const perSong = new Map();
    const cleaned = (Array.isArray(motifs) ? motifs : [])
      .map((m) => ({
        name: String(m?.name || "").trim().slice(0, 20),
        description: String(m?.description || "").trim().slice(0, 100),
        keywords: (Array.isArray(m?.keywords) ? m.keywords : []).map((k) => String(k).trim()).filter((k) => k && k.length <= 8).slice(0, 5),
        songs: (Array.isArray(m?.songs) ? m.songs : [])
          .filter((x) => bySlug.has(x?.slug))
          .filter((x) => {
            const n = perSong.get(x.slug) || 0;
            if (n >= 3) return false;
            perSong.set(x.slug, n + 1);
            return true;
          })
          .map((x) => {
            const quote = String(x.quote || "").trim();
            const ok = quote && squash(bySlug.get(x.slug)).includes(squash(quote));
            return { slug: x.slug, quote: ok ? quote.slice(0, 80) : "" };
          }),
      }))
      .filter((m) => m.name && m.songs.length >= 2)
      .slice(0, 8);
    if (!cleaned.length) return Response.json({ error: "유효한 모티프가 없습니다" }, { status: 502 });

    const data = { motifs: cleaned, count: songs.length, at: new Date().toISOString() };
    await writeData("motifs.json", JSON.stringify(data, null, 1), `data: 가사 모티프 ${cleaned.length}개 (${songs.length}곡)`);
    return Response.json({ motifs: cleaned.length, count: songs.length });
  }

  // 추천 곡 — 영화 tasteRecs와 같은 구조. 컬렉션 취향 집계를 Gemini에 주고
  // '없는 곡'을 추천받은 뒤, iTunes로 찾아 아트워크·30초 미리듣기를 붙인다.
  // 이미 있는 곡·이전 추천은 제외하고 data/song-recs.json에 누적한다.
  if (action === "songRecs") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const songs = await getAllSongsRuntime();
    if (songs.length < 10)
      return Response.json({ error: `곡이 ${songs.length}곡뿐입니다 (10곡 이상 필요)` }, { status: 422 });

    const tally = (vals) => {
      const m = new Map();
      for (const v of vals) if (v) m.set(v, (m.get(v) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const fmt = (rows) => rows.map(([k, n]) => `${k} ${n}곡`).join(", ");
    const country = tally(songs.map((s) => s.tags.find((t) => COUNTRY_TAGS.includes(t)) || "기타"));
    const genre = tally(songs.map((s) => genreTagOf(s.tags)));
    const decade = tally(songs.filter((s) => s.year).map((s) => `${Math.floor(+s.year / 10) * 10}s`));
    const artists = tally(songs.map((s) => s.artist)).slice(0, 20);
    const emotion = tally(songs.map((s) => s.emotion));
    const keywords = tally(songs.flatMap((s) => s.keywords || [])).slice(0, 15);
    // 59곡 규모라 회피 목록은 전곡을 그대로 준다 (영화의 상위 300 트림과 달리)
    const have = songs.map((s) => `${s.title} - ${s.artist}`).join("; ");
    // 취향 리포트가 있으면 추천 프롬프트에 함께 — 숫자 집계가 못 담는
    // 교차 해석(장르×감정, 수집 성향)이 추천 방향을 잡아준다
    const report = await readRuntimeData("music-report.json", null);
    const reportHint = report?.text
      ? `\n이 사람의 취향 리포트(참고해 추천 방향을 잡아라):\n${report.text.slice(0, 1500)}\n`
      : "";

    // 생성 모드 — 균형(기본)/깊게/넓게/분위기. 프롬프트의 방향 지시만 다르다.
    const MODES = {
      balance: { label: "균형", brief: "절반은 '취향의 연장선'(direction: extend), 절반은 '새로운 방향'(direction: discover)으로 섞어라." },
      deep: { label: "깊게", brief: "가장 많이 담은 장르·감정·아티스트 계열을 더 깊게 파고들어라. 대부분 direction: extend." },
      wide: { label: "넓게", brief: "기존 취향과 연결점은 남기되 새로운 국가·시대·아티스트 중심으로 확장하라. 대부분 direction: discover." },
      mood: { label: "분위기", brief: "" }, // 감정이 붙는다
    };
    const mode = MODES[body.mode] ? body.mode : "balance";
    const moodEmotion = mode === "mood" ? parseEmotion(body.emotion) : "";
    const brief =
      mode === "mood"
        ? `'${moodEmotion || "고독"}'의 감정에 맞는 곡 중심으로 추천하라. 익숙한 축이면 extend, 새로운 축이면 discover.`
        : MODES[mode].brief;

    const raw = await geminiText(
      key,
      `아래는 한 사람의 음악 컬렉션 취향 집계다 (총 ${songs.length}곡).${reportHint}
국가: ${fmt(country)}
장르: ${fmt(genre)}
연대: ${fmt(decade)}
아티스트: ${fmt(artists)}
감정: ${fmt(emotion)}
가사 키워드: ${keywords.map(([k]) => k).join(", ")}
이 취향에 맞으면서 컬렉션에 '없는' 곡 28곡을 추천하라. 이번 추천의 방향: ${brief}
JSON 배열로만:
[{"title":"곡 제목","artist":"아티스트","why":"추천 이유","direction":"extend|discover","basedOn":{"songs":["컬렉션의 '제목 - 아티스트' 그대로, 0~2개"],"genres":["연결된 장르 0~2개"],"emotions":["연결된 감정 0~2개"],"reason":"연결 근거 한국어 30자 이내"}}]
규칙:
- direction: 기존 취향의 연장이면 "extend", 새로운 발견이면 "discover"
- basedOn.songs: 반드시 아래 컬렉션 목록에 실제로 있는 표기 그대로. 없으면 빈 배열
- basedOn.reason 예: "서늘한 질감과 내면적 가사의 연장", "일본 록 비중을 2010년대로 확장"
- 이미 담은 아티스트의 곡은 최대 5곡까지만
- 아래 컬렉션에 이미 있는 곡과 그 리메이크·커버는 제외: ${have}
- title은 원제 그대로(검색 매칭용), why는 취향과 연결한 한국어 40자 이내 한 구절
- 실제 발매된 곡만. 28곡(매칭 탈락 여유분). 순수 JSON만 출력`,
      true
    );

    // basedOn 검증 — lib/admin/based-on.js (동명곡 방어 포함, 테스트로 지킴)
    const cleanBasedOn = makeBasedOnCleaner(songs);
    let recs;
    try {
      recs = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
    } catch {
      return Response.json({ error: "추천 생성 실패 (응답 파싱)" }, { status: 502 });
    }
    if (!Array.isArray(recs) || !recs.length)
      return Response.json({ error: "추천이 비었습니다 (쿼터·과부하)" }, { status: 502 });

    // 곡명+아티스트 → iTunes (미·한 스토어 병렬). 키 불필요, rate limit 넉넉.
    const searched = await Promise.all(
      recs.filter((r) => r?.title && r?.artist).map(async (r) => {
        try {
          const term = encodeURIComponent(`${r.title} ${r.artist}`);
          const lists = await Promise.all(
            ["US", "KR"].map((c) =>
              fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=5&country=${c}`)
                .then((x) => x.json())
                .then((x) => x.results || [])
                .catch(() => [])
            )
          );
          return { r, results: lists.flat().map(itunesToResult) };
        } catch {
          return { r, results: [] };
        }
      })
    );

    // 컬렉션(트랙ID + 제목|아티스트)과 이전 추천 제외, 새 것만 위에 얹는다
    const haveTrack = new Set(songs.map((s) => String(s.trackId)).filter(Boolean));
    const haveKey = new Set(songs.map((s) => `${normText(s.title)}|${normText(s.artist)}`));
    const prev = await readRuntimeData("song-recs.json", { items: [] });
    const prevItems = (prev.items || []).filter(
      (m) => !haveTrack.has(String(m.trackId)) && !haveKey.has(`${normText(m.title)}|${normText(m.artist)}`)
    );
    const prevTrack = new Set(prevItems.map((m) => String(m.trackId)));
    const now = new Date().toISOString();

    const added = [];
    const used = new Set();
    for (const { r, results } of searched) {
      if (added.length >= 20) break;
      const hit = results.find((c) => {
        const id = String(c.trackId);
        if (!c.trackId || haveTrack.has(id) || prevTrack.has(id) || used.has(id)) return false;
        if (haveKey.has(`${normText(c.title)}|${normText(c.artist)}`)) return false;
        // 아티스트가 실제로 일치해야 — 동명 커버곡 오매칭 방지
        return normText(c.artist).includes(normText(r.artist)) || normText(r.artist).includes(normText(c.artist));
      });
      if (!hit) continue;
      used.add(String(hit.trackId));
      added.push({
        trackId: hit.trackId,
        title: hit.title,
        artist: hit.artist,
        artwork: hit.artwork,
        preview: hit.preview,
        year: hit.year,
        genre: hit.genre,
        why: String(r.why || "").trim(),
        basedOn: cleanBasedOn(r.basedOn),
        direction: r.direction === "discover" ? "discover" : "extend",
        at: now,
      });
    }
    if (!added.length && prevItems.length === prev.items?.length)
      return Response.json({ error: "새 추천을 찾지 못했습니다 (이미 추천했거나 담은 곡)" }, { status: 502 });

    // 최신 100곡만 유지 — 오래 쌓이면 파일과 페이지가 무한히 자란다.
    // 같은 at을 공유하는 항목이 한 회차 — runs가 회차별 모드를 기억한다.
    const items = [...added, ...prevItems].slice(0, 100);
    const runs = [
      { at: now, mode, ...(moodEmotion ? { emotion: moodEmotion } : {}), label: mode === "mood" ? `분위기 · ${moodEmotion}` : MODES[mode].label },
      ...(prev.runs || []),
    ].slice(0, 20);
    await writeData(
      "song-recs.json",
      JSON.stringify({ items, runs, at: now }, null, 1),
      `data: 추천 곡 +${added.length} (${runs[0].label}, 누적 ${items.length})`
    );
    return Response.json({ added: added.length, total: items.length, mode: runs[0].label });
  }
  return null;
}
