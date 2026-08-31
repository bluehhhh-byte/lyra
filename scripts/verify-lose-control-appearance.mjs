import assert from "node:assert/strict";
import fs from "node:fs";
import { parseFrontmatter } from "../lib/songs.js";
import { normalizeAppearanceData } from "../lib/song-appearances.js";

const slug = "l-arc-en-ciel-浸食-lose-control";
const evidenceUrl = "https://www.oricon.co.jp/prof/14296/products/147445/2/";
const officialDiscography = "https://larc-en-ciel.com/s/n137/discography/KSC2-234?ima=0000&link=ROBO004";

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "LyraEvidenceAudit/1.0" },
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.ok, `${url} returned ${response.status}`);
  const bytes = await response.arrayBuffer();
  const declared = response.headers.get("content-type")?.match(/charset=([^;]+)/i)?.[1];
  // Oricon's legacy page declares Shift-JIS inside the HTML but omits it from
  // the HTTP header. Decode it explicitly so the evidence assertion reads the
  // same words a browser shows instead of mojibake.
  const charset = declared || (new URL(url).hostname.endsWith("oricon.co.jp") ? "shift_jis" : "utf-8");
  return new TextDecoder(charset).decode(bytes);
}

if (process.argv.includes("--production")) {
  const html = await fetchText(`https://lyracyno.vercel.app/songs/${encodeURIComponent(slug)}`);
  assert.match(html, /고질라/);
  assert.match(html, /삽입곡/);
  assert.match(html, /일본판 사운드트랙/);
  assert.match(html, /data-song-appearances/);
  assert.ok(html.includes("oricon.co.jp/prof/14296/products/147445/2"), "production must expose the evidence link");
  console.log("production Lose Control appearance verification passed");
} else {
  const songRaw = fs.readFileSync(new URL(`../songs/${slug}.md`, import.meta.url), "utf8");
  const song = parseFrontmatter(songRaw).meta;
  const data = normalizeAppearanceData(JSON.parse(fs.readFileSync(new URL("../data/song-appearances.json", import.meta.url), "utf8")));
  const item = data.items.find((value) => value.songSlug === slug);

  assert.ok(item, "Lose Control appearance must exist");
  assert.equal(item.workTitle, "고질라");
  assert.equal(item.originalTitle, "Godzilla");
  assert.equal(item.tmdbId, 929);
  assert.equal(item.workType, "movie");
  assert.equal(item.role, "insert_song");
  assert.equal(item.status, "verified");
  assert.equal(item.evidenceUrl, evidenceUrl);
  assert.match(song.title_ko, /통제 상실/);
  assert.match(song.comment, /삽입곡/);
  assert.match(song.comment, /일본판 사운드트랙/);
  assert.doesNotMatch(song.comment, /주제가/);

  const [oricon, official] = await Promise.all([fetchText(evidenceUrl), fetchText(officialDiscography)]);
  assert.match(oricon, /GODZILLA/i);
  assert.match(oricon, /挿入歌/);
  assert.match(official, /ゴジラTHE ALBUM/);
  console.log("Lose Control appearance verification passed");
}
