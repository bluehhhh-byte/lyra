import { readSong, writeSong, deleteSong } from "../../../lib/store";
import { getAllSongs } from "../../../lib/songs";

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
      results.push({
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName,
        artwork: r.artworkUrl100.replace("100x100", "600x600"),
        thumb: r.artworkUrl100,
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
    const { title, artist, album, duration } = body;
    const qs = (o) => new URLSearchParams(o).toString();
    // exact signature match first — usually the clean official transcription
    let res = await fetch(
      `https://lrclib.net/api/get?${qs({ artist_name: artist, track_name: title, album_name: album || "", duration })}`
    );
    if (res.ok) {
      const { plainLyrics } = await res.json();
      if (plainLyrics) return Response.json({ lyrics: plainLyrics.trim() });
    }
    // fallback: search and pick the closest-duration result that has lyrics
    const list = await fetch(
      `https://lrclib.net/api/search?${qs({ track_name: title, artist_name: artist })}`
    ).then((r) => (r.ok ? r.json() : []));
    const best = list
      .filter((r) => r.plainLyrics)
      .sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration))[0];
    return Response.json({ lyrics: best ? best.plainLyrics.trim() : null });
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
    const { title, titleKo, artist, artistKo, album, year, artwork, lang, tags, comment, lyrics, preview } = body;
    const slug = `${artist} ${title}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
      .replace(/^-|-$/g, "");
    const md = `---
title: ${title}
title_ko: ${titleKo || title}
artist: ${artist}
artist_ko: ${artistKo || ""}
album: ${album}
year: ${year || ""}
artwork: ${artwork}
preview: ${preview || ""}
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
