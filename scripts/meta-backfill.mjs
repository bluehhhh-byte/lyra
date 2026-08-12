// 인스타 임포트 곡 메타 백필 — Deezer판 (iTunes가 장기 rate limit이라 대체).
// 커버·30초 미리듣기·앨범명·재생시간을 채운다. trackId(애플)는 비워둠.
import fs from "fs";
import { normText } from "../lib/admin/itunes.js";
import { setField, FM, fmValue } from "../lib/admin/frontmatter.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dz(q) {
  try {
    const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`);
    const j = await r.json();
    return j.data || [];
  } catch {
    return [];
  }
}

const files = fs.readdirSync("songs").filter((f) => f.endsWith(".md"));
const targets = [];
for (const f of files) {
  const raw = fs.readFileSync("songs/" + f, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(FM);
  if (!m || fmValue(m[1], "source") !== "instagram") continue;
  if ((fmValue(m[1], "artwork") || "").startsWith("https")) continue;
  targets.push(f);
}
console.log("대상:", targets.length);

let fixed = 0, miss = 0, done = 0;
for (const f of targets) {
  const raw = fs.readFileSync("songs/" + f, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(FM);
  const title = fmValue(m[1], "title");
  const artist = fmValue(m[1], "artist");
  // 정밀 검색 → 실패 시 느슨한 검색
  let results = await dz(`artist:"${artist}" track:"${title}"`);
  if (!results.length) { await sleep(200); results = await dz(`${title} ${artist}`); }
  const hit = results.find(
    (x) => normText(x.artist?.name).includes(normText(artist)) || normText(artist).includes(normText(x.artist?.name))
  );
  if (hit) {
    let out = raw;
    out = setField(out, "artwork", hit.album?.cover_xl || hit.album?.cover_big || "", "year");
    out = setField(out, "preview", hit.preview || "", "artwork");
    out = setField(out, "duration", String(hit.duration || ""), "trackId");
    if (hit.album?.title) out = setField(out, "album", hit.album.title, "artist_ko");
    fs.writeFileSync("songs/" + f, out);
    fixed++;
  } else miss++;
  done++;
  if (done % 40 === 0) console.log(`${done}/${targets.length} (보강 ${fixed})`);
  await sleep(250);
}
console.log(`완료 — 보강 ${fixed} · 실패 ${miss}`);
