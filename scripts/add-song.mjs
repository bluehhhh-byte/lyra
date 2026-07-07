#!/usr/bin/env node
// Usage: GEMINI_API_KEY=xxx npm run add -- "song title artist"
// Paste English lyrics, then Ctrl-D. Writes songs/<slug>.md with Gemini translations.
import fs from "fs";
import path from "path";

const query = process.argv.slice(2).join(" ").trim();
const API_KEY = process.env.GEMINI_API_KEY;
if (!query) die('usage: npm run add -- "song title artist"');
if (!API_KEY) die("GEMINI_API_KEY env var required");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

// 1. iTunes metadata
const itunes = await fetch(
  `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`
).then((r) => r.json());
const hit = itunes.results?.[0];
if (!hit) die(`no iTunes result for "${query}"`);
const meta = {
  title: hit.trackName,
  artist: hit.artistName,
  album: hit.collectionName,
  artwork: hit.artworkUrl100.replace("100x100", "600x600"),
};
console.error(`found: ${meta.title} — ${meta.artist} (${meta.album})`);
console.error("paste English lyrics, then Ctrl-D:\n");

// 2. lyrics from stdin
const lyrics = fs.readFileSync(0, "utf8").trim();
if (!lyrics) die("no lyrics given");

// 3. Gemini translation, interleaved format
const prompt = `You are translating song lyrics from English to Korean for a personal lyrics blog.
Song: "${meta.title}" by ${meta.artist}.

Rules:
- Output the lyrics with each English line followed by its Korean translation on the next line, prefixed with "> ".
- Keep section headers like [Verse 1] or [Chorus] as-is on their own line (do not translate them).
- Keep blank lines between stanzas.
- Translate naturally and poetically, preserving metaphor and tone. Not word-for-word.
- Output ONLY the interleaved lyrics, no commentary.

Lyrics:
${lyrics}`;

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  }
);
if (!res.ok) die(`Gemini API error ${res.status}: ${await res.text()}`);
const data = await res.json();
const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
if (!translated) die("empty Gemini response: " + JSON.stringify(data));

// 4. write markdown
const slug = `${meta.artist} ${meta.title}`
  .toLowerCase()
  .replace(/[^a-z0-9가-힣]+/g, "-")
  .replace(/^-|-$/g, "");
const file = path.join(process.cwd(), "songs", `${slug}.md`);
const md = `---
title: ${meta.title}
artist: ${meta.artist}
album: ${meta.album}
artwork: ${meta.artwork}
tags: []
date: ${new Date().toISOString().slice(0, 10)}
comment:
---
${translated}
`;
fs.writeFileSync(file, md);
console.error(`\nwrote ${file}`);
console.error("검수하고 tags / comment 채운 뒤 발행하세요.");
