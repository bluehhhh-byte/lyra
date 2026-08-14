// 곡 메타(커버·미리듣기·앨범·재생시간·trackId) 백필 — 다중 공급자.
//   node scripts/meta-backfill.mjs [--provider=itunes|deezer|musicbrainz] [--write] [--limit=N] [--resume]
//
// 원칙:
//  - 기본은 dry-run — --write 없이는 곡 파일을 만지지 않는다
//  - artist·title이 '둘 다' 정규화 일치해야 채운다 (lib/admin/match.js)
//  - live/remix/remaster는 원제에 있을 때만. ambiguous는 채우지 않는다
//  - 인스타 원본 필드(title/artist/year/published/가사/source*)는 절대 불변
//  - 이미 artwork가 있는 곡은 건드리지 않는다 (재실행 멱등)
//  - iTunes: 분당 10회 이하(요청 간 6.5초), canary 5회 통과 후 본 작업,
//    429/403/HTML은 장기 차단으로 취급해 circuit open + nextRetryAt 저장
//  - 상태·캐시는 .backfill/itunes-state.json (gitignore)
import fs from "fs";
import path from "path";
import { FM, fmValue, setField } from "../lib/admin/frontmatter.js";
import { pickTrack } from "../lib/admin/match.js";
import { guard } from "../lib/admin/preflight.js";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const PROVIDER = (args.find((a) => a.startsWith("--provider=")) || "--provider=itunes").split("=")[1];
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "--limit=100").split("=")[1]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (WRITE) guard();
const UA = "Lyra/1.0 (personal music archive)";

// ── 상태 (iTunes rate limit 회로) ───────────────────────────────────────────
const STATE_DIR = ".backfill";
const STATE = path.join(STATE_DIR, "itunes-state.json");
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return { cache: {}, nextRetryAt: 0, strikes: 0 }; } };
const saveState = (s) => { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 1)); };
const state = loadState();

// ── 공급자 ──────────────────────────────────────────────────────────────────
async function itunesSearch(term, store) {
  const key = `${store}|${term}`;
  if (state.cache[key]) return state.cache[key]; // 같은 조합 재호출 금지
  if (Date.now() < state.nextRetryAt) throw new Error(`circuit open — ${new Date(state.nextRetryAt).toISOString()}까지 대기`);
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5&country=${store}`,
    { headers: { "User-Agent": UA } }
  );
  const text = await res.text();
  const limited = res.status === 429 || res.status === 403 || /rate limit/i.test(text) || /^\s*</.test(text);
  if (limited) {
    state.strikes = (state.strikes || 0) + 1;
    const retryAfter = Number(res.headers.get("retry-after") || 0) * 1000;
    const backoff = [15 * 60e3, 60 * 60e3, 6 * 3600e3, 24 * 3600e3][Math.min(state.strikes - 1, 3)];
    state.nextRetryAt = Date.now() + (retryAfter || backoff);
    saveState(state);
    throw new Error(`iTunes 제한 (${res.status}) — strikes ${state.strikes}, ${Math.round((state.nextRetryAt - Date.now()) / 60000)}분 뒤 재시도`);
  }
  state.strikes = 0;
  let results = [];
  try { results = (JSON.parse(text).results || []).map((x) => ({
    title: x.trackName, artist: x.artistName,
    artwork: (x.artworkUrl100 || "").replace("100x100", "600x600"),
    preview: x.previewUrl || "", trackId: x.trackId || "",
    duration: Math.round((x.trackTimeMillis || 0) / 1000) || "", album: x.collectionName || "",
    // 미리듣기·커버는 스토어 홍보 조건으로 쓰는 것이라 출처와 원문 링크를 같이 남긴다
    provider: "itunes", externalUrl: x.trackViewUrl || "", year: (x.releaseDate || "").slice(0, 4),
  })); } catch {}
  state.cache[key] = results;
  saveState(state);
  return results;
}

async function deezerSearch(term) {
  try {
    const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=5`);
    const j = await r.json();
    return (j.data || []).map((x) => ({
      title: x.title, artist: x.artist?.name,
      artwork: x.album?.cover_xl || x.album?.cover_big || "",
      preview: x.preview || "", trackId: "", duration: String(x.duration || ""), album: x.album?.title || "",
      provider: "deezer", externalUrl: x.link || "", year: "",
    }));
  } catch { return []; }
}

// MusicBrainz(메타) + Cover Art Archive(커버). iTunes·Deezer 둘 다 못 찾은 곡의
// 마지막 경로다. 미리듣기는 없고 커버·앨범·연도만 얻는다.
// MB는 초당 1회 이하 + User-Agent 필수. CAA는 커버가 없으면 404를 준다.
async function musicbrainzSearch(term, artist) {
  // 곡은 recording으로 찾는다 — release-group은 앨범 단위라 곡 제목으로는 안 걸린다.
  // 커버는 그 곡이 실린 릴리스의 release-group에 붙어 있다.
  // 따옴표로 묶으면 정확 일치라 거의 안 걸린다("One Republic" ≠ "OneRepublic").
  // 특수문자만 걷어내고 느슨하게 물은 뒤, 걸러내는 건 pickTrack이 한다.
  const clean = (s) => String(s || "").replace(/[:"~^(){}\[\]\\/!+\-]/g, " ").replace(/\s+/g, " ").trim();
  const q = `recording:(${clean(term)}) AND artist:(${clean(artist)})`;
  try {
    const r = await fetch(
      `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=5`,
      { headers: { "User-Agent": UA, Accept: "application/json" } }
    );
    if (!r.ok) return [];
    const j = await r.json();
    const groups = [];
    const seen = new Set();
    for (const rec of j.recordings || []) {
      for (const rel of rec.releases || []) {
        const g = rel["release-group"];
        if (!g?.id || seen.has(g.id)) continue;
        seen.add(g.id);
        groups.push({
          id: g.id,
          title: rec.title,
          artist: (rec["artist-credit"] || []).map((a) => a.name).join(" "),
          album: rel.title || g.title || "",
          year: (rel.date || g["first-release-date"] || "").slice(0, 4),
        });
      }
    }
    const out = [];
    for (const g of groups.slice(0, 4)) {
      const cover = `https://coverartarchive.org/release-group/${g.id}/front-500`;
      // 커버가 실제로 있는 것만 후보로 — 없는 릴리스그룹을 채우면 깨진 이미지가 된다
      let ok = false;
      try {
        const head = await fetch(cover, { method: "HEAD", redirect: "follow", headers: { "User-Agent": UA } });
        ok = head.ok;
      } catch {}
      await sleep(1100);
      if (!ok) continue;
      out.push({
        title: g.title, artist: g.artist,
        artwork: cover, preview: "", trackId: "", duration: "", album: g.album,
        provider: "coverartarchive",
        externalUrl: `https://musicbrainz.org/release-group/${g.id}`,
        year: g.year,
      });
      break; // 커버가 붙은 첫 릴리스면 충분하다
    }
    return out;
  } catch { return []; }
}

// ── canary — iTunes 재개 판정 (10초 간격 5회 전부 정상 JSON이어야) ─────────
async function canary() {
  console.log("canary 5회 (10초 간격)…");
  for (let i = 0; i < 5; i++) {
    const res = await fetch("https://itunes.apple.com/search?term=test&entity=song&limit=1&country=US", { headers: { "User-Agent": UA } });
    const text = await res.text();
    if (!res.ok || !/^\s*\{/.test(text)) {
      console.log(`  canary ${i + 1} 실패 (${res.status}) — 본 작업 중단`);
      return false;
    }
    console.log(`  canary ${i + 1} ok`);
    if (i < 4) await sleep(10000);
  }
  return true;
}

// ── 대상 수집 ───────────────────────────────────────────────────────────────
// 기본은 커버 없는 곡. --links는 커버가 있어도 Apple 링크(trackId)가 없는 곡을 노린다 —
// Deezer·CAA로 커버만 채운 곡들은 스토어 링크가 비어 있다.
const LINKS_ONLY = args.includes("--links");
const targets = [];
for (const f of fs.readdirSync("songs").filter((x) => x.endsWith(".md"))) {
  const raw = fs.readFileSync("songs/" + f, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(FM);
  if (!m) continue;
  if (LINKS_ONLY) {
    const hasApple = /^\d+$/.test((fmValue(m[1], "trackId") || "").trim()) ||
      (fmValue(m[1], "external_url") || "").includes("music.apple.com");
    if (hasApple) continue;
  } else if ((fmValue(m[1], "artwork") || "").startsWith("https")) continue; // 검증된 커버는 덮지 않음
  targets.push({
    f, raw,
    title: fmValue(m[1], "title"), artist: fmValue(m[1], "artist"),
    lang: fmValue(m[1], "lang"), trackId: fmValue(m[1], "trackId"),
  });
}
console.log(`대상 ${targets.length}곡 · provider=${PROVIDER} · ${WRITE ? "WRITE" : "dry-run"} · limit=${LIMIT}`);

if (PROVIDER === "itunes") {
  if (Date.now() < state.nextRetryAt) {
    console.log(`circuit open — ${new Date(state.nextRetryAt).toISOString()} 이후 --resume으로 재시도`);
    process.exit(0);
  }
  if (!(await canary())) {
    state.nextRetryAt = Date.now() + 12 * 3600e3;
    saveState(state);
    process.exit(0);
  }
}

const storeOrder = (t) =>
  /[가-힣]/.test(t.artist) ? ["KR", "US"] : t.lang === "ja" ? ["JP", "US"] : ["US", "KR", "JP"];

let filled = 0, unavailable = 0, ambiguous = 0, done = 0, breaker = 0;
for (const t of targets.slice(0, LIMIT)) {
  done++;
  let results = [], status = "unavailable", hit = null;
  try {
    if (PROVIDER === "deezer") {
      results = await deezerSearch(`artist:"${t.artist}" track:"${t.title}"`);
      await sleep(300);
    } else if (PROVIDER === "musicbrainz") {
      results = await musicbrainzSearch(t.title, t.artist);
      await sleep(1100); // MB는 초당 1회 이하
    } else {
      for (const store of storeOrder(t)) {
        results = await itunesSearch(`${t.title} ${t.artist}`, store);
        await sleep(6500); // 분당 10회 이하
        const picked = pickTrack(results, t);
        if (picked.hit) { results = [picked.hit]; break; } // 정확 매칭 시 다음 스토어 생략
      }
    }
    ({ hit, status } = pickTrack(results, t));
  } catch (e) {
    console.log(`  중단: ${e.message}`);
    breaker++;
    if (breaker >= 3) { console.log("연속 제한 3회 — circuit open, 종료"); break; }
    continue;
  }
  if (status === "ambiguous") ambiguous++;
  else if (!hit) unavailable++;
  else {
    filled++;
    console.log(`  ${WRITE ? "채움" : "(dry)"} ${t.f}: ${hit.artist} - ${hit.title} [${status}]`);
    if (WRITE) {
      // 시작할 때 읽어둔 내용이 아니라 지금 파일을 다시 읽는다. 이 스크립트는 한 곡에
      // 6.5초씩 쓰므로 전체가 도는 동안 다른 작업(번역·메타 채우기)이 같은 파일을
      // 고칠 수 있다 — 오래된 스냅샷으로 덮으면 그 변경이 조용히 사라진다.
      if (!fs.existsSync("songs/" + t.f)) { console.log(`  건너뜀(그새 삭제됨): ${t.f}`); continue; }
      let out = fs.readFileSync("songs/" + t.f, "utf8").replace(/\r\n/g, "\n");
      if (!out.match(FM)) { console.log(`  건너뜀(형식 깨짐): ${t.f}`); continue; }
      if (!LINKS_ONLY && (fmValue(out.match(FM)[1], "artwork") || "").startsWith("https")) { console.log(`  건너뜀(그새 채워짐): ${t.f}`); continue; }
      // --links는 링크·미리듣기만 채운다 — 이미 검증된 커버를 다른 스토어 것으로 바꾸지 않는다
      const keepArt = LINKS_ONLY && (fmValue(out.match(FM)[1], "artwork") || "").startsWith("https");
      if (!keepArt && hit.artwork) out = setField(out, "artwork", hit.artwork, "year");
      if (hit.preview && !fmValue(out.match(FM)[1], "preview")) out = setField(out, "preview", hit.preview, "artwork");
      if (hit.trackId) out = setField(out, "trackId", String(hit.trackId), "preview");
      if (hit.duration) out = setField(out, "duration", String(hit.duration), "trackId");
      if (hit.album) out = setField(out, "album", hit.album, "artist_ko");
      // 출처 표시용 — 어느 스토어의 미리듣기인지, 그 곡의 원문 페이지가 어디인지
      if (hit.provider) out = setField(out, "preview_provider", hit.provider, "preview");
      if (hit.externalUrl) out = setField(out, "external_url", hit.externalUrl, "preview_provider");
      // 보관 게시물에는 발매연도가 없는 캡션이 많다 — 카탈로그에서만 채운다(덮어쓰지 않음)
      if (hit.year && !fmValue(out.match(FM)[1], "year")) out = setField(out, "year", hit.year, "album");
      fs.writeFileSync("songs/" + t.f, out);
    }
  }
}
console.log(`완료 — 채움 ${filled} · unavailable ${unavailable} · ambiguous ${ambiguous} (${done}곡 처리)`);
