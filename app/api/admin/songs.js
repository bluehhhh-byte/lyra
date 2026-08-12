// 곡(음악) 도메인 액션 — route.js 디스패처가 호출. 처리하면 Response, 아니면 null.
import { readSong, writeSong, deleteSong, readData, writeData } from "../../../lib/store";
import { getAllSongs, capitalizeLyricLines } from "../../../lib/songs";
import { GENRES, capGenre, COUNTRY_TAGS, genreTagOf, genreIssue } from "../../../lib/genre";
import { EMOTIONS, parseEmotion, parseKeywords } from "../../../lib/keywords";
import { geminiText, GEMINI_LITE_MODEL } from "../../../lib/admin/gemini";
import { FM, fmValue, isBlank, parseTags, setField } from "../../../lib/admin/frontmatter";
import { hasCJK, nativeMeta, findLyrics } from "../../../lib/admin/lrclib";
import { normText, fetchArtistCatalog, withTimeout, itunesToResult } from "../../../lib/admin/itunes";
import {
  needsReading, commentPrompt, translateLyrics, normalizeInterleaved, restanzaBody,
  carryNotes, computeAuto, originalLyrics, lyricLineCount, isJaLine,
} from "../../../lib/admin/song-meta";
import { kstToday } from "../../../lib/kst";
import { summarizeMusicTaste } from "../../../lib/music-taste-core";

export async function handleSongs(action, body) {  if (action === "search") {
    const PAGE = 50; // per store — Apple caps at 200; 50 keeps latency sane and triples visible depth vs 25
    const offset = body.offset || 0;
    // free-text search across title and artist — iTunes matches both by default
    // search US/KR/JP stores together — each store has a different catalog
    // Normal /search across stores + the artist catalog (for hidden 19금 tracks),
    // in parallel. Catalog runs only on the first page — its tracks are folded in
    // once, filtered to title matches below, so paging stays search-only.
    const [stores, catalog] = await Promise.all([
      Promise.all(
        ["US", "KR", "JP"].map((c) =>
          fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(body.query)}&entity=song&limit=${PAGE}&offset=${offset}&country=${c}`
          )
            .then((r) => r.json())
            .then((r) => r.results || [])
            .catch(() => [])
        )
      ),
      offset === 0 ? withTimeout(fetchArtistCatalog(body.query), 3500) : Promise.resolve([]),
    ]);
    // Normalize before matching — iTunes decorates names with (feat. …), curly
    // quotes, brackets and hyphens that make honest matches miss.
    const norm = (s) =>
      (s || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[’'ʻ´`"]/g, "")
        .replace(/[()\[\]\-_.,!?~×&/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    // relevance: query matches in title and artist float to the top
    const q = norm(body.query);
    const words = q.split(" ").filter(Boolean);
    const score = (r) => {
      const t = norm(r.trackName);
      const a = norm(r.artistName);
      let s = 0;
      // tiers are exclusive — an exact title must not also collect startsWith+includes,
      // or a song *named* "radiohead" outranks the band Radiohead.
      if (a === q) s += 120; // a bare band name is almost always an artist search
      else if (a.startsWith(q)) s += 50;
      else if (a.includes(q)) s += 25;
      if (t === q) s += 100;
      else if (t.startsWith(q)) s += 40;
      else if (t.includes(q)) s += 30;
      let hits = 0;
      for (const w of words) {
        const inT = t.includes(w);
        const inA = a.includes(w);
        if (inT) s += 10;
        if (inA) s += 12;
        if (inT || inA) hits++;
      }
      // "artist + part of the title" is the common query — every word landing
      // somewhere (artist or title) is the strongest relevance signal there is
      if (words.length > 1 && hits === words.length) s += 80;
      // demote covers/karaoke — the original should win
      if (
        /cover|karaoke|instrumental|tribute|music box|orgel|オルゴール|カラオケ|原曲|歌ってみた|acapella/.test(
          `${t} ${a}`
        )
      )
        s -= 60;
      // gentle recency tiebreaker (≤3 pts) — never overrides a relevance tier,
      // but among equally-matched tracks (e.g. an artist-only search's whole
      // catalog) the newest float up, so a recent hidden release isn't buried.
      const yr = +(r.releaseDate || "").slice(0, 4) || 0;
      if (yr) s += Math.min(3, Math.max(0, (yr - 2000) / 9));
      return s;
    };
    // One scoring pool: store tracks + catalog tracks the /search dropped
    // (19금/explicit). Query words already covered by the catalog's artist names
    // are the "artist" part; whatever's left is the "title" part. Artist-only
    // search ("Master Muzik") has no leftover title words → include the whole
    // catalog (its hidden tracks too). "Master Muzik 도련님" leaves 도련님 → keep
    // only catalog tracks whose title matches, so the discography doesn't flood.
    // Scoring both pools together ranks the all-words match (artist AND title) top.
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
    const results = pool.sort((x, y) => score(y) - score(x)).map(itunesToResult);
    return Response.json({
      results,
      hasMore: stores.some((s) => s.length === PAGE),
      nextOffset: offset + PAGE,
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
      songs: getAllSongs().map((s) => ({ slug: s.slug, title: s.title, artist: s.artist })),
    });
  }

  if (action === "requalityOne") {
    const s = getAllSongs().find((x) => x.slug === body.slug);
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


  // Format lint — catches the failure modes we've actually hit: original lines
  // whose translation is missing, Japanese lines without a reading, and Gemini's
  // inline ">"/"+" markers glued onto the lyric line (the supernatural bug).
  if (action === "lint") {
    const report = getAllSongs()
      .map((s) => {
        const lines = s.stanzas.flatMap((st) => st.lines);
        const translated = lines.filter((l) => l.ko?.trim()).length;
        // a Korean song with zero translations is a deliberate choice, not a defect
        const untranslated =
          s.lang === "ko" && translated === 0 ? 0 : lines.length - translated;
        const noReading = lines.filter((l) => isJaLine(l.en) && !l.reading?.trim()).length;
        const inline = lines.filter((l) => / [>+] /.test(l.en)).length;
        const issues = [];
        if (inline) issues.push(`인라인 마커 의심 ${inline}줄`);
        if (untranslated) issues.push(`번역 없음 ${untranslated}줄`);
        if (noReading) issues.push(`독음 없음 ${noReading}줄`);
        // genre sanity — flagged songs get a one-click 장르 재생성 in the UI
        const gIssue = genreIssue(genreTagOf(s.tags));
        if (gIssue) issues.push(`장르: ${gIssue}`);
        return { slug: s.slug, title: s.title, artist: s.artist, issues, genreFix: !!gIssue };
      })
      .filter((s) => s.issues.length);
    return Response.json({ report, total: getAllSongs().length });
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
        !(t.startsWith("[") && t.endsWith("]"))
      );
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
      const wantKo = !hasKo && !skipTranslate;
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
    const list = getAllSongs()
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
      out = setField(out, "comment", auto.comment, "date");
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
    if (auto.comment) {
      out = setField(out, "comment", auto.comment, "date");
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
    return Response.json({ updated });
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
    const old = genreTagOf(getAllSongs().find((x) => x.slug === body.slug)?.tags || []);
    // rewrite the whole tags line (country·genre·year) so the genre slot updates
    // in place, and sync the frontmatter genre field to match
    let out = setField(raw, "tags", `[${auto.tags.join(", ")}]`, "year");
    if (newGenre) out = setField(out, "genre", newGenre, "year");
    await writeSong(body.slug, out, `chore(song): regen genre — ${body.slug}`);
    return Response.json({ genre: newGenre, changed: newGenre !== old });
  }

  // Regenerate ONLY the comment ('~다'체), leaving lyrics and other fields intact.
  if (action === "regenComment") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    const raw = song.raw.replace(/\r\n/g, "\n");
    const m = raw.match(FM);
    if (!m) return Response.json({ error: "frontmatter를 읽을 수 없음" }, { status: 422 });
    const [, fm, bodyText] = m;
    const comment = (
      await geminiText(key, commentPrompt(fmValue(fm, "title"), fmValue(fm, "artist"), originalLyrics(bodyText)))
    )
      .replace(/\s*\n+\s*/g, " ")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (!comment) return Response.json({ error: "코멘트 생성 실패" }, { status: 502 });
    await writeSong(body.slug, setField(raw, "comment", comment, "date"), `chore(song): regen comment — ${body.slug}`);
    return Response.json({ comment });
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

  if (action === "load") {
    const song = await readSong(body.slug);
    if (!song) return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    return Response.json({ raw: song.raw });
  }

  if (action === "update") {
    if (!(await readSong(body.slug)))
      return Response.json({ error: "곡을 찾을 수 없음" }, { status: 404 });
    await writeSong(body.slug, body.raw, `edit(song): ${body.slug}`);
    return Response.json({ ok: true });
  }

  if (action === "delete") {
    await deleteSong(body.slug);
    return Response.json({ ok: true });
  }

  if (action === "save") {
    const { title, titleKo, artist, artistKo, album, year, artwork, lang, tags, comment, lyrics, preview, trackId, duration, genre, keywords, emotion } = body;
    const slug = `${artist} ${title}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
      .replace(/^-|-$/g, "");
    // catches the paths that skip translation: a hand-typed body, and the
    // "이대로 사용" bypass that copies Korean lyrics over verbatim
    let lyricBody = capitalizeLyricLines(lyrics.trim());
    // auto-restanza on publish — reorganize the lyrics by musical structure.
    // Best-effort: if Gemini is down or the body is too short, keep it as typed.
    try {
      const restanza = await restanzaBody({
        title,
        artist,
        bodyText: lyricBody,
        key: process.env.GEMINI_API_KEY,
      });
      if (restanza) lyricBody = restanza;
    } catch {} // never block a publish on the layout pass
    const md = `---
title: ${title}
title_ko: ${titleKo || title}
artist: ${artist}
artist_ko: ${artistKo || ""}
album: ${album || ""}
year: ${year || ""}
genre: ${genre || ""}
artwork: ${artwork || ""}
preview: ${preview || ""}
trackId: ${trackId || ""}
duration: ${duration || ""}
lang: ${lang}
tags: [${(tags || "").split(",").map((t) => t.trim()).filter(Boolean).join(", ")}]
keywords: [${parseKeywords(keywords).join(", ")}]
emotion: ${parseEmotion(emotion)}
date: ${kstToday()}
published: ${new Date().toISOString()}
comment: ${(comment || "").replace(/\s*\n+\s*/g, " ")}
---
${lyricBody}
`;
    await writeSong(slug, md, `add(song): ${slug}`);
    return Response.json({ slug });
  }

  // 음악 취향 AI 리포트 — 영화 tasteReport의 음악판. 집계 요약을 Gemini에
  // 넘겨 3~4문단 해석을 받아 저장한다. /songs/taste 상단에 표시되고,
  // songRecs가 추천 프롬프트에 이 리포트를 함께 넣는다.
  if (action === "musicReport") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const songs = getAllSongs();
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
${lines}`
    );
    if (!text) return Response.json({ error: "리포트 생성 실패 (쿼터·과부하)" }, { status: 502 });

    const report = { text: text.trim(), count: t.count, at: new Date().toISOString() };
    await writeData("music-report.json", JSON.stringify(report, null, 1), `data: 음악 취향 리포트 (${t.count}곡)`);
    return Response.json(report);
  }

  // 추천 곡 — 영화 tasteRecs와 같은 구조. 컬렉션 취향 집계를 Gemini에 주고
  // '없는 곡'을 추천받은 뒤, iTunes로 찾아 아트워크·30초 미리듣기를 붙인다.
  // 이미 있는 곡·이전 추천은 제외하고 data/song-recs.json에 누적한다.
  if (action === "songRecs") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const songs = getAllSongs();
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
    const report = readData("music-report.json", null);
    const reportHint = report?.text
      ? `\n이 사람의 취향 리포트(참고해 추천 방향을 잡아라):\n${report.text.slice(0, 1500)}\n`
      : "";

    const raw = await geminiText(
      key,
      `아래는 한 사람의 음악 컬렉션 취향 집계다 (총 ${songs.length}곡).${reportHint}
국가: ${fmt(country)}
장르: ${fmt(genre)}
연대: ${fmt(decade)}
아티스트: ${fmt(artists)}
감정: ${fmt(emotion)}
가사 키워드: ${keywords.map(([k]) => k).join(", ")}
이 취향에 맞으면서 컬렉션에 '없는' 곡 28곡을 추천하라. JSON 배열로만:
[{"title":"곡 제목","artist":"아티스트","why":"추천 이유"}]
규칙:
- 편애 지점(자주 담은 장르·아티스트·감정·연대)을 파고들되, 이미 담은 아티스트의 곡은 최대 5곡까지만 — 나머지는 취향이 닿을 새로운 아티스트의 발견작으로
- 아래 컬렉션에 이미 있는 곡과 그 리메이크·커버는 제외: ${have}
- title은 원제 그대로(검색 매칭용), why는 취향과 연결한 한국어 40자 이내 한 구절
- 실제 발매된 곡만. 28곡(매칭 탈락 여유분). 순수 JSON만 출력`,
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
    const prev = readData("song-recs.json", { items: [] });
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
        at: now,
      });
    }
    if (!added.length && prevItems.length === prev.items?.length)
      return Response.json({ error: "새 추천을 찾지 못했습니다 (이미 추천했거나 담은 곡)" }, { status: 502 });

    // 최신 100곡만 유지 — 오래 쌓이면 파일과 페이지가 무한히 자란다
    const items = [...added, ...prevItems].slice(0, 100);
    await writeData("song-recs.json", JSON.stringify({ items, at: now }, null, 1), `data: 추천 곡 +${added.length} (누적 ${items.length})`);
    return Response.json({ added: added.length, total: items.length });
  }
  return null;
}
