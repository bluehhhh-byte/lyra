import { readSong, writeSong, deleteSong } from "../../../lib/store";

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
      if (t === q || a === q) s += 100;
      if (t.startsWith(q)) s += 40;
      if (t.includes(q)) s += 30;
      if (a.includes(q)) s += 20;
      for (const w of words) {
        if (t.includes(w)) s += 10;
        if (a.includes(w)) s += 12;
      }
      // demote covers/karaoke — the original should win
      if (/cover|karaoke|instrumental|tribute|music box|orgel|オルゴール|acapella/.test(`${t} ${a}`))
        s -= 30;
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
    const prompt = `You are translating song lyrics to Korean for a personal lyrics-analysis blog.
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
    const { title, artist, lyrics, lang, year, genre } = body;
    const tags = [];
    tags.push({ ko: "한국", ja: "일본", en: "영미" }[lang] || "기타");
    if (year) tags.push(`${Math.floor(+year / 10) * 10}s`);
    if (genre) tags.push(genre.toLowerCase().replace(/\//g, "-"));
    // Korean titles stay; others get a Korean title via Gemini (below)
    let titleKo = lang === "ko" ? title : "";
    // mood tags via Gemini — best-effort, deterministic tags still returned on failure
    const key = process.env.GEMINI_API_KEY;
    if (key && lyrics) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `노래 "${title}" (${artist})의 가사를 읽고 감성/분위기 태그를 한국어로 정확히 2개만 골라줘. 예: 새벽감성, 그리움, 신나는, 위로, 애도, 설렘, 쓸쓸함, 벅참. 쉼표로만 구분해서 태그만 출력.\n\n가사:\n${lyrics.slice(0, 2000)}`,
                    },
                  ],
                },
              ],
            }),
          }
        );
        const data = await res.json();
        const moods = data.candidates?.[0]?.content?.parts?.[0]?.text
          ?.trim()
          .split(",")
          .map((t) => t.trim().replace(/[.\s]+$/, ""))
          .filter((t) => t && t.length <= 10)
          .slice(0, 2);
        if (moods) tags.push(...moods);
      } catch {}
    }
    if (key && !titleKo) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `노래 제목 "${title}"을(를) 한국어로 표기해줘. 고유명사/영어 제목은 한글 음역(예: Yesterday→예스터데이), 뜻이 있는 제목은 자연스럽게 번역. 제목만 출력.`,
                    },
                  ],
                },
              ],
            }),
          }
        );
        const data = await res.json();
        const t = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().split("\n")[0];
        if (t) titleKo = t.replace(/^["']|["']$/g, "");
      } catch {}
    }
    return Response.json({ tags, titleKo });
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
    const { title, titleKo, artist, album, year, artwork, lang, tags, comment, lyrics, preview } = body;
    const slug = `${artist} ${title}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/g, "-")
      .replace(/^-|-$/g, "");
    const md = `---
title: ${title}
title_ko: ${titleKo || title}
artist: ${artist}
album: ${album}
year: ${year || ""}
artwork: ${artwork}
preview: ${preview || ""}
lang: ${lang}
tags: [${(tags || "").split(",").map((t) => t.trim()).filter(Boolean).join(", ")}]
date: ${new Date().toISOString().slice(0, 10)}
comment: ${comment || ""}
---
${lyrics.trim()}
`;
    await writeSong(slug, md, `add(song): ${slug}`);
    return Response.json({ slug });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
