// 가사 모티프 — 주제는 사람이 정하고, 곡과 인용은 데이터에서 뽑는다.
//   node scripts/build-motifs.mjs [--write]
//
// 인용은 그 곡의 '한국어로 읽히는 줄'에서 찾는다: 한국어 곡은 원문, 외국곡은 번역.
// 예전에는 원문에서만 찾아 외국곡 24곡의 구절이 비어 있었다.
import fs from "fs";
import { getAllSongs } from "../lib/songs.js";
import { isNoteLine } from "../lib/admin/needs.js";

const WRITE = process.argv.includes("--write");
const THEMES = [
  { name: "밤과 새벽", description: "잠들지 못한 시간에 혼자 남아 마음을 들여다보는 노래들.", keywords: ["밤", "새벽", "달", "어둠", "불빛"] },
  { name: "눈물과 상처", description: "울음을 참거나 흘리며 아픔을 통과하는 순간들.", keywords: ["눈물", "상처", "아픔", "한숨", "고통"] },
  { name: "바다와 파도", description: "물가에 서서 멀어진 것을 바라보는 마음.", keywords: ["바다", "파도", "강", "모래", "우산"] },
  { name: "거리와 골목", description: "도시의 길 위에서 스치는 사람과 풍경.", keywords: ["거리", "골목", "도시", "버스", "가로등"] },
  { name: "꿈과 몽환", description: "현실과 꿈의 경계가 흐려지는 자리.", keywords: ["꿈", "구름", "우주", "천사", "영혼"] },
  { name: "계절과 날씨", description: "바람·비·햇살로 시간이 흐르는 것을 재는 노래들.", keywords: ["바람", "비", "여름", "겨울", "햇살"] },
  { name: "기억과 사진", description: "지나간 것을 붙잡아 두려는 기록들.", keywords: ["기억", "추억", "사진", "편지", "약속"] },
  { name: "저항과 세상", description: "바깥의 규칙과 시선에 맞서는 목소리.", keywords: ["세상", "거짓말", "돈", "총", "지옥"] },
];

const songs = getAllSongs();

// 한국어로 읽히는 줄 — ko 곡은 원문, 그 외는 번역. 해설은 뺀다.
const koreanLines = (s) =>
  s.stanzas
    .flatMap((st) => st.lines)
    .map((l) => (s.lang === "ko" ? l.en : l.ko) || "")
    .map((t) => t.trim())
    .filter((t) => t && !isNoteLine(t) && /[가-힣]/.test(t) && t.length <= 60);

const quoteFor = (s, keywords) => {
  const lines = koreanLines(s);
  for (const k of keywords) {
    const hit = lines.find((t) => t.includes(k));
    if (hit) return hit.slice(0, 80);
  }
  return "";
};

const perSong = new Map();
const motifs = [];
for (const t of THEMES) {
  const scored = songs
    .map((s) => ({ s, n: (s.keywords || []).filter((k) => t.keywords.includes(k)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || (a.s.title || "").localeCompare(b.s.title));
  const picked = [];
  for (const { s } of scored) {
    if ((perSong.get(s.slug) || 0) >= 2) continue; // 한 곡이 여러 주제를 독점하지 않게
    const quote = quoteFor(s, t.keywords);
    if (!quote && picked.length >= 6) continue;    // 구절 없는 곡은 자리가 남을 때만
    perSong.set(s.slug, (perSong.get(s.slug) || 0) + 1);
    picked.push({ slug: s.slug, quote });
    if (picked.length >= 8) break;
  }
  if (picked.length >= 2) motifs.push({ ...t, songs: picked });
}

const data = { motifs, count: songs.length, at: new Date().toISOString() };
const withQuote = motifs.reduce((a, m) => a + m.songs.filter((x) => x.quote).length, 0);
const total = motifs.reduce((a, m) => a + m.songs.length, 0);
if (WRITE) fs.writeFileSync("data/motifs.json", JSON.stringify(data, null, 1));
console.log(`${WRITE ? "생성" : "미리보기"} — 모티프 ${motifs.length}개 · 곡 ${total} · 구절 ${withQuote} (빈 구절 ${total - withQuote})`);
