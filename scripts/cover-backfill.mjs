// 커버 보충 — iTunes·Deezer·MusicBrainz 어디에도 없는 곡을 국내 서비스에서 찾는다.
//   node scripts/cover-backfill.mjs [--write] [--limit=N]
//
// meta-backfill.mjs가 도는 세 카탈로그는 국내 인디·힙합과 일본 곡을 자주 빠뜨린다.
// 벅스·지니는 곡 페이지의 og:image가 앨범 커버라 그걸 그대로 쓴다.
// artwork가 이미 있는 곡은 건드리지 않는다(재실행 안전).
import fs from "fs";
import { getAllSongs } from "../lib/songs.js";
import { setField } from "../lib/admin/frontmatter.js";
import { guard } from "../lib/admin/preflight.js";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "--limit=100").split("=")[1]);
// 서비스 쪽 표기가 아예 다른 곡은 검색어를 손으로 준다. 이때 제목·아티스트 대조는
// 건너뛴다 — 표기가 다르다는 걸 알고 넣는 것이므로 사람이 로그로 확인한다.
//   --slug=mgmt-piece-of-what --as="MGMT Pieces of What"
const ONLY = (args.find((a) => a.startsWith("--slug=")) || "").slice("--slug=".length);
const AS = (args.find((a) => a.startsWith("--as=")) || "").slice("--as=".length);
if (WRITE) guard();

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };
const get = async (u) => { try { const r = await fetch(u, { headers: UA }); return r.ok ? await r.text() : ""; } catch { return ""; } };
// Sigur Rós / Hoppípolla처럼 발음 부호가 붙은 표기를 같은 글자로 본다.
// NFD는 한글 음절도 자모로 쪼개므로 부호를 턴 뒤 NFC로 다시 합쳐야 한다 —
// 안 그러면 한글이 통째로 사라져서 "뭐라고요? What?"이 "what"이 되어 아무 곡이나 맞는다.
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC")
  .toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]/g, "");
const dec = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");

// 곡 제목·아티스트가 맞는지. 제목은 부분 일치까지 봐준다 — 서비스마다 (feat…)를 붙인다.
const titleOk = (a, b) => {
  if (AS) return true;
  const x = norm(a.replace(/\(.*?\)/g, "")), y = norm(b.replace(/\(.*?\)/g, ""));
  return !!x && !!y && (x.includes(y) || y.includes(x));
};
const artistOk = (page, mine) => {
  if (AS) return true;
  const p = norm(page), m = norm(mine);
  if (!page) return true;
  return p.includes(m) || m.includes(p) || mine.split(/[,·]/).some((t) => t.trim().length > 1 && p.includes(norm(t)));
};

// 지니 CDN은 og:image를 http로 준다 — 같은 주소가 https로도 열린다
const https = (u) => (u || "").replace(/^http:\/\//, "https://");

async function bugs(s, q) {
  const html = await get(`https://music.bugs.co.kr/search/track?q=${encodeURIComponent(q)}`);
  for (const id of [...new Set([...html.matchAll(/track\/(\d+)/g)].map((m) => m[1]))].slice(0, 5)) {
    const p = await get(`https://music.bugs.co.kr/track/${id}`);
    const og = (p.match(/<meta property="og:title" content="([^"]*)"/) || [])[1];
    const img = (p.match(/<meta property="og:image" content="([^"]*)"/) || [])[1];
    if (!og || !img) continue;
    const [t, a = ""] = dec(og).split(" / ").map((x) => x.trim());
    if (titleOk(t, s.title) && artistOk(a, s.artist)) return { url: https(img), via: `bugs/${id}`, matched: `${a} / ${t}` };
  }
  return null;
}

async function genie(s, q) {
  const html = await get(`https://www.genie.co.kr/search/searchMain?query=${encodeURIComponent(q)}`);
  for (const id of [...new Set([...html.matchAll(/fnViewSongInfo\('(\d+)'/g)].map((m) => m[1]))].slice(0, 5)) {
    const p = await get(`https://www.genie.co.kr/detail/songInfo?xgnm=${id}`);
    const og = (p.match(/<meta property="og:title" content="([^"]*)"/) || [])[1];
    const img = (p.match(/<meta property="og:image" content="([^"]*)"/) || [])[1];
    if (!og || !img) continue;
    // og:title은 "제목 / 아티스트 - genie" — 제목 안에도 " / "가 있을 수 있어 마지막 것으로 가른다
    const full = dec(og).replace(/\s*-\s*genie\s*$/, "");
    const cut = full.lastIndexOf(" / ");
    const t = cut > 0 ? full.slice(0, cut) : full;
    const a = cut > 0 ? full.slice(cut + 3).trim() : "";
    if (titleOk(t.trim(), s.title) && artistOk(a, s.artist))
      return { url: https(img.startsWith("//") ? `https:${img}` : img), via: `genie/${id}`, matched: `${a} / ${t.trim()}` };
  }
  return null;
}

// 국내 서비스에 없는 해외 곡은 iTunes를 느슨하게 한 번 더 본다.
// meta-backfill은 artist·title이 둘 다 정확히 맞아야 채우는데, 커버 이미지 하나는
// 조금 느슨해도 된다 — 대신 어떤 곡에 맞췄는지 로그에 남겨 눈으로 확인한다.
async function itunes(s, q) {
  const t = await get(`https://itunes.apple.com/search?media=music&limit=10&term=${encodeURIComponent(q)}`);
  let list = [];
  try { list = JSON.parse(t).results || []; } catch { return null; }
  for (const r of list) {
    if (!r.artworkUrl100 || !titleOk(r.trackName, s.title) || !artistOk(r.artistName, s.artist)) continue;
    return { url: r.artworkUrl100.replace(/\/\d+x\d+bb\.jpg$/, "/600x600bb.jpg"), via: "itunes", matched: `${r.artistName} / ${r.trackName}` };
  }
  return null;
}

// 서비스마다 아티스트 표기가 달라 '아티스트 제목'으로는 안 잡히는 곡이 있다 — 제목만으로 한 번 더
const find = async (s, q = `${s.artist} ${s.title}`) =>
  (await bugs(s, q)) || (await genie(s, q)) ||
  (await itunes(s, q)) || (await bugs(s, s.title)) || (await genie(s, s.title));

const songs = getAllSongs()
  .filter((s) => !(s.artwork || "").startsWith("https") && !s.artwork_none)
  .filter((s) => !ONLY || s.slug === ONLY)
  .slice(0, LIMIT);
console.log(`대상 ${songs.length}곡${WRITE ? " · WRITE" : " (미리보기)"}`);

let filled = 0;
for (const s of songs) {
  const hit = await find(s, AS || undefined);
  if (!hit) { console.log(`  × ${s.artist} — ${s.title}`); continue; }
  if (!/^https:\/\/\S+$/.test(hit.url)) { console.log(`  ! ${s.slug}: URL이 https가 아님 ${hit.url}`); continue; }
  console.log(`  ○ ${s.artist} — ${s.title} ← ${hit.matched} [${hit.via}]`);
  if (WRITE) {
    const p = `songs/${s.slug}.md`;
    fs.writeFileSync(p, setField(fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"), "artwork", hit.url));
  }
  filled++;
}
console.log(`\n채움 ${filled} / ${songs.length}`);
