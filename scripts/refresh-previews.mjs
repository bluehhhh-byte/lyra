// 만료된 미리듣기 주소를 갈아 끼운다.
//   node scripts/refresh-previews.mjs [--write] [--limit=N]
//
// Deezer가 주는 미리듣기 주소에는 만료 시각이 붙어 있다(`hdnea=exp=…`).
// 며칠 지나면 전부 죽어서 재생 버튼이 아무 소리도 내지 않는다. 정적 사이트에는
// 쓸 수 없는 형태다. iTunes 미리듣기(audio-ssl.itunes.apple.com)는 만료가 없다.
//
// 그래서 만료된 주소를 가진 곡만 iTunes에서 다시 찾아 미리듣기·trackId·애플 링크를
// 바꾼다. artist·title이 둘 다 맞을 때만 쓴다(lib/admin/match.js) — 못 찾으면
// 죽은 주소를 남기지 않고 비운다. 재생 안 되는 버튼보다 없는 버튼이 낫다.
import fs from "fs";
import { getAllSongs } from "../lib/songs.js";
import { setField } from "../lib/admin/frontmatter.js";
import { pickTrack } from "../lib/admin/match.js";
import { guard } from "../lib/admin/preflight.js";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "--limit=500").split("=")[1]);
if (WRITE) guard();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = Math.floor(Date.now() / 1000);
// 만료 시각이 이미 지난 주소 — 지금 죽어 있다
const dead = (u) => {
  const m = (u || "").match(/exp=(\d+)/);
  if (m && Number(m[1]) < now) return true;
  // 뮤직비디오 미리듣기(.m4v)는 오디오 태그가 재생하지 못한다 — 곡 미리듣기로 바꾼다
  return /video-ssl\.itunes\.apple\.com/.test(u || "");
};

const targets = getAllSongs().filter((s) => dead(s.preview)).slice(0, LIMIT);
console.log(`만료된 미리듣기 ${targets.length}곡${WRITE ? " · WRITE" : " (미리보기)"}`);

let ok = 0, cleared = 0;
for (const s of targets) {
  let hit = null;
  try {
    const r = await fetch(`https://itunes.apple.com/search?media=music&limit=15&term=${encodeURIComponent(`${s.title} ${s.artist}`)}`,
      { headers: { "User-Agent": "Lyra/1.0 (personal music archive)" } });
    // pickTrack은 { artist, title } 이름을 쓴다 — iTunes 응답 필드명을 맞춰 준다.
    // 뮤직비디오(kind: music-video)는 미리듣기가 .m4v라 오디오 태그로 재생되지 않는다 — 곡만 본다.
    if (r.ok) {
      const cands = ((await r.json()).results || [])
        .filter((c) => c.kind === "song")
        .map((c) => ({ ...c, artist: c.artistName, title: c.trackName }));
      hit = pickTrack(cands, s).hit;
    }
  } catch {}
  await sleep(6500); // iTunes 분당 10회 이하

  const p = `songs/${s.slug}.md`;
  let raw = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  if (hit?.previewUrl) {
    raw = setField(raw, "preview", hit.previewUrl);
    raw = setField(raw, "preview_provider", "itunes");
    if (hit.trackId) raw = setField(raw, "trackId", String(hit.trackId));
    if (hit.trackViewUrl) raw = setField(raw, "external_url", hit.trackViewUrl);
    ok++;
    console.log(`  ○ ${s.artist} — ${s.title}`);
  } else {
    raw = setField(raw, "preview", "");
    raw = setField(raw, "preview_provider", "");
    cleared++;
    console.log(`  · ${s.artist} — ${s.title} (iTunes에 없음 — 미리듣기 비움)`);
  }
  if (WRITE) fs.writeFileSync(p, raw);
}
console.log(`\n교체 ${ok} · 비움 ${cleared}`);
