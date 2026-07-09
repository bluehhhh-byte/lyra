import { readSong, writeSong, deleteSong } from "../../../lib/store";
import { getAllSongs } from "../../../lib/songs";

// the requality scan fans out across every song; give it room on Vercel.
// It's best run locally anyway (like backfill), where no timeout applies.
export const maxDuration = 60;

async function geminiText(key, prompt, json = false) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
      }),
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

// Kanji-or-kana artist names get a Korean reading; latin ones legitimately don't.
export const needsReading = (artist) => /[぀-ヿ㐀-鿿]/.test(artist || "");

// Shared by the add flow (`autotag`) and the backfill tool.
async function computeAuto({ title, artist, lyrics, lang, year, genre }) {
  // deterministic tags — always present even without Gemini
  const tags = [{ ko: "한국", ja: "일본", en: "영미" }[lang] || "기타"];
  if (year) tags.push(`${Math.floor(+year / 10) * 10}s`);
  if (genre) tags.push(genre.toLowerCase().replace(/\//g, "-"));
  let titleKo = lang === "ko" ? title : "";
  let artistKo = "";
  let comment = "";

  // one combined Gemini call (avoids free-tier rate limits from many calls)
  const key = process.env.GEMINI_API_KEY;
  if (key && lyrics) {
    try {
      const raw = await geminiText(
        key,
        `노래 "${title}" (${artist})에 대해 아래 스키마의 JSON으로 답해줘.
- moods: 가사 기반 감성/분위기 태그 2개(한국어). 예: 새벽감성, 그리움, 신나는, 위로, 애도, 설렘, 쓸쓸함
- titleKo: 곡 제목의 한국어 표기(영어·고유명사는 한글 음역, 뜻있는 제목은 번역)
- artistKo: 아티스트명이 일본어/한자면 한글 독음, 그 외에는 빈 문자열
- comment: 가사의 의미와 이 곡에 얽힌 실제 배경·일화를 녹인 개인 감상 1~2문장(담백한 톤)
가사:
${lyrics.slice(0, 2000)}`,
        true
      );
      const json = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
      if (Array.isArray(json.moods))
        tags.push(...json.moods.map((m) => String(m).trim()).filter((m) => m && m.length <= 10).slice(0, 2));
      if (!titleKo && json.titleKo) titleKo = String(json.titleKo).trim();
      if (json.artistKo) artistKo = String(json.artistKo).trim();
      if (json.comment) comment = String(json.comment).replace(/\s*\n+\s*/g, " ").trim();
    } catch {} // Gemini 실패해도 국가·연도·장르 태그는 유지
  }
  return { tags, titleKo, artistKo, comment };
}

const FM = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const fmValue = (fm, key) => (fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1] || "").trim();
const isBlank = (v) => !v || v === "[]";

// Replace `key: …` in place, or insert it right after `after:` when absent.
function setField(raw, key, value, after) {
  const line = `${key}: ${value}`;
  const existing = new RegExp(`^${key}:[ \\t]*.*$`, "m");
  if (existing.test(raw)) return raw.replace(existing, line);
  const anchor = new RegExp(`^(${after}:[ \\t]*.*)$`, "m");
  return anchor.test(raw) ? raw.replace(anchor, `$1\n${line}`) : raw;
}

// The body interleaves translation (`>`), reading (`+`) and note (`//`) lines —
// strip them so Gemini reads the original lyric, not our annotations.
const originalLyrics = (body) =>
  body
    .split("\n")
    .filter((l) => !/^\s*(>|\+|\/\/)/.test(l))
    .join("\n")
    .trim();

// ── lyrics lookup (lrclib) ────────────────────────────────────────────────
// iTunes' US store hands back romanized/translated titles ("Through the Night"
// for 밤편지, "Akuro No Oka" for アクロの丘) while lrclib is indexed under the
// native title. Measured hit rate jumped 12/16 → 15/16 by trying the native
// name too. A ±15s duration bound keeps a wrong-length track's lyrics out.
const LRC = "https://lrclib.net/api";
const DUR_BOUND = 15; // seconds
const hasCJK = (s) => /[぀-ヿ㐀-鿿가-힣]/.test(s || "");
// one retry — a transient network blip must not read as "no lyrics exist", which
// is exactly the false-negative that made songs look un-findable.
async function getJson(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) return null; // 404 etc. — real "not found"
    } catch {}
    if (attempt === 0) await new Promise((res) => setTimeout(res, 400));
  }
  return null;
}

const lrcCleanTitle = (t) =>
  (t || "")
    .replace(
      /\s*[\(\[][^)\]]*(remaster|live|acoustic|version|edit|mix|instrumental|deluxe|mono|stereo|feat|with|explicit|bonus)[^)\]]*[\)\]]/gi,
      ""
    )
    .replace(/\s*-\s*(single|ep|remaster(ed)?( \d{4})?|live|radio edit|.*version).*$/i, "")
    .replace(/\s*(feat\.?|ft\.?)\s+.*$/i, "")
    .trim();
const lrcCleanArtist = (a) => (a || "").split(/\s*[,&×]\s*|\s+(?:feat\.?|with|and the)\s+/i)[0].trim();

// Same track id in the JP/KR store often carries the native title/artist.
async function nativeMeta(trackId) {
  if (!trackId) return null;
  for (const country of ["JP", "KR"]) {
    const j = await getJson(
      `https://itunes.apple.com/lookup?${new URLSearchParams({ id: trackId, country })}`
    );
    const r = j?.results?.[0];
    if (r && hasCJK(`${r.trackName}${r.artistName}`))
      return { title: r.trackName, artist: r.artistName };
  }
  return null;
}

function nameCandidates(picked, native) {
  const out = [];
  const push = (t, a) => t && a && out.push({ t, a });
  push(picked.title, picked.artist);
  push(lrcCleanTitle(picked.title), lrcCleanArtist(picked.artist));
  if (native) {
    push(native.title, native.artist);
    push(lrcCleanTitle(native.title), lrcCleanArtist(native.artist));
  }
  const seen = new Set();
  return out.filter(({ t, a }) => {
    const k = `${t}|${a}`.toLowerCase();
    return seen.has(k) ? false : seen.add(k);
  });
}

const withinBound = (rowDur, want) => !want || !rowDur || Math.abs(rowDur - want) <= DUR_BOUND;

// bounded-concurrency map — lrclib rate-limits, and a 14-song serial scan overruns
// the serverless timeout. 5 in flight finishes the requality scan in seconds.
async function pmap(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

// Returns { lyrics, lines, native } or null. Stops at the first bounded hit.
async function findLyrics({ title, artist, album, duration, trackId }) {
  const native = hasCJK(`${title}${artist}`) ? null : await nativeMeta(trackId);
  // omit falsy fields — URLSearchParams stringifies undefined to the literal
  // "undefined", which corrupts lrclib's exact /get match for pre-change songs.
  const qs = (o) =>
    new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "")).toString();
  for (const { t, a } of nameCandidates({ title, artist }, native)) {
    const g = await getJson(`${LRC}/get?${qs({ artist_name: a, track_name: t, album_name: album, duration })}`);
    if (g?.plainLyrics?.trim() && withinBound(g.duration, duration)) {
      const text = g.plainLyrics.trim();
      return { lyrics: text, lines: text.split("\n").filter((l) => l.trim()).length, native };
    }
    const list = (await getJson(`${LRC}/search?${qs({ track_name: t, artist_name: a })}`)) || [];
    const best = list
      .filter((r) => r.plainLyrics?.trim())
      .map((r) => ({ r, d: Math.abs((r.duration || 0) - (duration || 0)) }))
      .sort((x, y) => x.d - y.d)
      .find((x) => withinBound(x.r.duration, duration));
    if (best) {
      const text = best.r.plainLyrics.trim();
      return { lyrics: text, lines: text.split("\n").filter((l) => l.trim()).length, native };
    }
  }
  return null;
}

// Auth is enforced by middleware.js (password cookie). Writes go through
// lib/store — fs locally, GitHub commits on Vercel.
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

  if (action === "search") {
    const PAGE = 25;
    const offset = body.offset || 0;
    // free-text search across title and artist — iTunes matches both by default
    // search US/KR/JP stores together — each store has a different catalog
    const stores = await Promise.all(
      ["US", "KR", "JP"].map((c) =>
        fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(body.query)}&entity=song&limit=${PAGE}&offset=${offset}&country=${c}`
        )
          .then((r) => r.json())
          .then((r) => r.results || [])
          .catch(() => [])
      )
    );
    // relevance: query matches in title and artist float to the top
    const q = body.query.toLowerCase().trim();
    const words = q.split(/\s+/).filter(Boolean);
    const score = (r) => {
      const t = (r.trackName || "").toLowerCase();
      const a = (r.artistName || "").toLowerCase();
      let s = 0;
      // tiers are exclusive — an exact title must not also collect startsWith+includes,
      // or a song *named* "radiohead" outranks the band Radiohead.
      if (a === q) s += 120; // a bare band name is almost always an artist search
      else if (a.startsWith(q)) s += 50;
      else if (a.includes(q)) s += 25;
      if (t === q) s += 100;
      else if (t.startsWith(q)) s += 40;
      else if (t.includes(q)) s += 30;
      for (const w of words) {
        if (t.includes(w)) s += 10;
        if (a.includes(w)) s += 12;
      }
      // demote covers/karaoke — the original should win
      if (
        /cover|karaoke|instrumental|tribute|music box|orgel|オルゴール|カラオケ|原曲|歌ってみた|acapella/.test(
          `${t} ${a}`
        )
      )
        s -= 60;
      return s;
    };
    // interleave stores so same-score results from KR/JP aren't buried under US
    const interleaved = [];
    for (let i = 0; i < PAGE; i++)
      for (const s of stores) if (s[i]) interleaved.push(s[i]);
    const seen = new Set();
    const results = [];
    for (const r of interleaved.sort((x, y) => score(y) - score(x))) {
      const key = `${r.trackName}|${r.artistName}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const art = r.artworkUrl100 || ""; // some tracks/regions omit artwork
      results.push({
        trackId: r.trackId, // lets the lyrics step re-query the JP/KR store for native names
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName,
        artwork: art.replace("100x100", "600x600"),
        thumb: art,
        duration: Math.round((r.trackTimeMillis || 0) / 1000),
        year: (r.releaseDate || "").slice(0, 4),
        genre: r.primaryGenreName || "",
        preview: r.previewUrl || "",
      });
    }
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
  // yields a shorter one). Re-query with every name and report a longer hit.
  if (action === "requality") {
    const scanned = await pmap(getAllSongs(), 5, async (s) => {
      try {
        const have = s.stanzas.reduce(
          (n, st) => n + st.lines.filter((l) => l.en?.trim()).length,
          0
        );
        const found = await findLyrics({
          title: s.title,
          artist: s.artist,
          album: s.album,
          duration: s.duration,
          trackId: s.trackId,
        });
        // only surface a meaningfully fuller version (guards transcription noise)
        return found && found.lines >= have + 5
          ? { slug: s.slug, title: s.title, artist: s.artist, have, found: found.lines }
          : null;
      } catch {
        return null; // one bad song must not abort the whole scan
      }
    });
    return Response.json({ list: scanned.filter(Boolean) });
  }

  if (action === "translate") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "GEMINI_API_KEY 환경변수가 없습니다" }, { status: 500 });
    const isJa = body.lang === "ja";
    const isKo = body.lang === "ko";
    const prompt = isKo
      ? `You are annotating Korean song lyrics for a Korean-speaking blog.
Song: "${body.title}" by ${body.artist}. The lyrics are mostly Korean but may contain English words or lines.

Output format — for each lyric line:
1. The original line as-is.
2. ONLY IF the line contains English words/phrases, add a "> " line rewriting the WHOLE line fully in natural Korean (translate the English parts, keep the Korean parts). If the line is already entirely Korean, output NO "> " line for it.

Rules:
- Keep section headers like [Verse 1] as-is on their own line. If a header is not bracketed, wrap it in brackets.
- Keep blank lines between stanzas.
- Output ONLY the interleaved lyrics, no commentary, no code fences.

Lyrics:
${body.lyrics}`
      : `You are translating song lyrics to Korean for a personal lyrics-analysis blog.
Song: "${body.title}" by ${body.artist}. Source language: ${isJa ? "Japanese" : "English"}.

Output format — for each lyric line, output:
1. The original line as-is
${isJa ? '2. "+ " followed by the Korean pronunciation reading (한글 독음) of the line\n3. "> " followed by a natural Korean translation' : '2. "> " followed by a natural Korean translation'}

Rules:
- Keep section headers like [Verse 1] or [サビ] as-is on their own line. If a header is not bracketed, wrap it in brackets.
- Keep blank lines between stanzas.
- Translate naturally and poetically, preserving metaphor and tone. Not word-for-word.
- Output ONLY the interleaved lyrics, no commentary, no code fences.

Lyrics:
${body.lyrics}`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) {
      return Response.json({ error: `Gemini ${res.status}: ${await res.text()}` }, { status: 502 });
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return Response.json({ error: "Gemini 응답이 비었습니다" }, { status: 502 });
    return Response.json({ text });
  }

  if (action === "autotag") {
    return Response.json(await computeAuto(body));
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
      genre: "", // not stored per song; country + decade + moods are enough
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
    const { title, titleKo, artist, artistKo, album, year, artwork, lang, tags, comment, lyrics, preview, trackId, duration } = body;
    const slug = `${artist} ${title}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
      .replace(/^-|-$/g, "");
    const md = `---
title: ${title}
title_ko: ${titleKo || title}
artist: ${artist}
artist_ko: ${artistKo || ""}
album: ${album || ""}
year: ${year || ""}
artwork: ${artwork || ""}
preview: ${preview || ""}
trackId: ${trackId || ""}
duration: ${duration || ""}
lang: ${lang}
tags: [${(tags || "").split(",").map((t) => t.trim()).filter(Boolean).join(", ")}]
date: ${new Date().toISOString().slice(0, 10)}
comment: ${(comment || "").replace(/\s*\n+\s*/g, " ")}
---
${lyrics.trim()}
`;
    await writeSong(slug, md, `add(song): ${slug}`);
    return Response.json({ slug });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
