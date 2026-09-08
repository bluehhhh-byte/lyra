// 일회성 — 일본어 제목 곡에 로마자 검색 별칭(search_aliases)을 채운다.
//
// 관리자의 등록곡 검색은 제목·한글제목·별칭·아티스트·앨범·slug·태그 글자만 본다.
// 일본 곡은 그 어느 칸에도 로마자가 없어서 "myaku"로는 脈이 안 찾혔다. 음역을
// 직접 만들지 않는다 — Apple 미국 스토어가 같은 트랙을 로마자로 내준다.
//
// trackId가 있으면 US lookup 한 번. 없으면 US 검색으로 후보를 찾은 뒤, 그 후보의
// JP lookup이 같은 제목을 돌려주는지 확인해서 다른 곡을 집는 것을 막는다.
//
// 실행: node scripts/backfill-romaji-aliases.mjs (dry-run) · --apply 실제 반영
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { FM, fmValue, setField } from "../lib/admin/frontmatter.js";
import { normText } from "../lib/admin/itunes.js";

dotenv.config({ path: ".env.local", quiet: true });
const APPLY = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL);
// 저장소 밖에 둔다 — 워킹 트리를 다른 작업과 공유한다.
const BACKUP = path.resolve("..", "lyra-romaji-backfill", "before");

// 가나·한자만 센다. 한글 제목은 이미 title_ko로 찾히고, 한글의 로마자 표기는
// 검색어로 쓰이지 않는다.
const JA = /[぀-ヿ㐀-䶿一-鿿]/;
const hasLatin = (value) => /\p{Script=Latin}/u.test(value || "");
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// 오래된 곡의 title은 "ザクロ 석류"처럼 원제와 한글 제목을 한 칸에 붙여 놨다.
// 그대로 검색어에 넣으면 Apple이 아무것도 못 찾는다.
const japaneseOnly = (title) => String(title).replace(/[가-힣]+/g, " ").replace(/\s+/g, " ").trim();

// 로마자 뒤에 붙는 판(라이브·기념반·투어) 꼬리는 별칭으로 쓸모가 없다.
// "Kiseki (Miracles)"처럼 실제 다른 이름인 괄호는 남긴다.
const EDITION = /\s*[([][^)\]]*\b(live|ver\.?|version|tour|anniversary|remaster(ed)?|edit|mix|instrumental|acoustic|deluxe|remix)\b[^)\]]*[)\]]\s*$/i;
const trimEdition = (name) => name.replace(EDITION, "").trim();

// Apple은 분당 20회쯤에서 막는다. 호출 사이를 벌려 버스트를 만들지 않는다.
async function apple(url) {
  await wait(1500);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Apple이 로마자를 갖고 있지 않은 곡들. 제목이 옛 한자체로 저장돼 있어(虛無·變わら
// ない·空氣公團) 스토어 검색이 아예 걸리지 않는 것이 대부분이다. 사람이 정한 값이며,
// 미국 스토어에 표기가 있는 것은 그 표기를 그대로 옮겼다.
const OVERRIDE = new Map([
  ["arai-yumi-ル-ジュの佺言", "Rouge no Dengon"],            // Apple 표기
  ["dir-en-grey-腐海-썩은-바다", "Fukai"],
  ["dreams-come-true-朝がまた来る", "Asa ga Mata Kuru"],
  ["gackt-再會-story-재회", "Saikai"],
  ["gackt-君に逢いたくて-그대를-만나고-싶어서", "Kimi ni Aitakute"],
  ["glay-空が青空であるために", "Sora ga Aozora de Aru Tame ni"],
  ["go-shiina-竈門炭治郎のうた", "Kamado Tanjirou no Uta"],  // Apple 표기
  ["gospellers-ひとり", "Hitori"],
  ["hideki-kaji-甘い-人", "Amai Koibito"],
  ["inoue-yosui-夢の中へ", "Yume no Naka e"],
  ["malice-mizer-虛無の中での遊戱", "Kyomu no Naka de no Yuugi"],
  ["misia-忘れない日日-잊을-수-없는-날들", "Wasurenai Hibi"],
  ["oku-hanako-變わらないもの-변하지-않는-것", "Kawaranai Mono"], // Apple 표기
  ["plastic-tree-月世界-달세계", "Gessekai"],
  // Apple은 어느 스토어에서도, MusicBrainz는 녹음·릴리스 어디에도 로마자를 갖고
  // 있지 않다. 곡 정보(오리콘·우타넷)에 실린 ふめつのはな를 옮겼다.
  ["raphael-滅花", "Fumetsu no Hana"],
  ["sheena-ringo-あかねさす歸路照らされど", "Akanesasu Kiro Terasaredo"],
  ["sheena-ringo-人間として", "Ningen Toshite"],
  ["the-yellow-monkey-聖なる海とサンシャイン", "Seinaru Umi to Sunshine"],
  ["the-yellow-monkey-聖なる海とサンシャイン-성스러운-바다와-선샤인", "Seinaru Umi to Sunshine"],
  ["千と千尋の神隱し-센과-치히로의-행방불명-ost-いつも何度でも", "Itsumo Nandodemo"],
  ["空氣公團-공기공단-旅をしませんか", "Tabi wo Shimasenka"],   // Apple 표기
  ["陰陽座-甲賀忍法帖", "Kouga Ninpouchou"],                   // Apple 표기
  ["鹿の一族-사슴의-일족-清く-ただしく", "Kiyoku Tadashiku"],   // Apple 표기
]);

const lookup = async (trackId, country) =>
  (await apple(`https://itunes.apple.com/lookup?${new URLSearchParams({ id: trackId, country })}`))?.results?.[0] || null;

async function resolveRomaji(title, artist, trackId) {
  const native = japaneseOnly(title);
  if (trackId) {
    const row = await lookup(trackId, "US");
    const name = trimEdition((row?.trackName || "").trim());
    if (name && !JA.test(name) && hasLatin(name)) return { romaji: name, how: "lookup" };
    // 미국 스토어도 일본어 제목을 그대로 쓰는 곡이 있다. 포기하지 말고 검색으로 넘어간다.
  }
  // 미국 스토어에서 찾고, 같은 트랙의 일본 스토어 표기가 우리 제목과 같은지
  // 확인한다 — 확인 없이는 동명이곡을 집을 수 있다.
  const found = await apple(
    `https://itunes.apple.com/search?${new URLSearchParams({ term: `${artist} ${native}`, entity: "song", limit: "10", country: "US" })}`
  );
  for (const row of found?.results || []) {
    const name = trimEdition((row.trackName || "").trim());
    if (!name || JA.test(name) || !hasLatin(name)) continue;
    if (normText(row.artistName) !== normText(artist)) continue;
    const jp = await lookup(row.trackId, "JP");
    if (normText(jp?.trackName) === normText(native)) return { romaji: name, how: "검색+대조" };
  }
  return { romaji: "", how: trackId ? "lookup·검색 모두 실패" : "검색-실패" };
}

const rows = await sql`select slug, raw from lyra_contents where kind='song' order by slug`;
const targets = rows
  .map((row) => {
    const raw = row.raw.replace(/\r\n/g, "\n");
    const fm = raw.match(FM)?.[1] || "";
    return { slug: row.slug, raw, fm, title: fmValue(fm, "title"), artist: fmValue(fm, "artist"), trackId: fmValue(fm, "trackId") };
  })
  .filter((song) => JA.test(song.title) && !fmValue(song.fm, "search_aliases").replace(/[\[\]\s]/g, ""));

console.log(`일본어 제목 · 별칭 없음: ${targets.length}곡\n`);
if (APPLY) fs.mkdirSync(BACKUP, { recursive: true });

let done = 0;
const failed = [];
for (const song of targets) {
  const { romaji, how } = OVERRIDE.has(song.slug)
    ? { romaji: OVERRIDE.get(song.slug), how: "수동" }
    : await resolveRomaji(song.title, song.artist, song.trackId);
  if (!romaji || normText(romaji) === normText(song.title)) {
    failed.push(`${song.slug} (${how})`);
    continue;
  }
  const next = setField(song.raw, "search_aliases", `[${romaji}]`, "title_ko");
  if (next.match(FM)?.[2] !== song.raw.match(FM)?.[2]) throw new Error(`${song.slug}: 본문이 바뀌었다 — 중단`);
  console.log(`${song.slug}: ${song.title} → "${romaji}" (${how})`);
  if (APPLY) {
    fs.writeFileSync(path.join(BACKUP, `${song.slug}.md`), song.raw);
    await sql`update lyra_contents set raw = ${next}, updated_at = now() where kind='song' and slug = ${song.slug}`;
  }
  done++;
}

console.log(`\n${APPLY ? "반영" : "(dry-run) 대상"} ${done}곡 · 못 구함 ${failed.length}곡`);
for (const line of failed) console.log(`  - ${line}`);
if (APPLY && done) {
  const secret = String(process.env.REVALIDATE_SECRET || "").trim();
  if (secret) {
    const res = await fetch("https://lyracyno.vercel.app/api/revalidate", { method: "POST", headers: { "x-revalidate-secret": secret } });
    console.log(`캐시 무효화: HTTP ${res.status}`);
  }
}
