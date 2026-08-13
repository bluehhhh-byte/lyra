// 가사 정확성 — 사람이 볼 필요 없이 기계가 잡을 수 있는 신호만 모은다.
//   node scripts/audit-lyrics.mjs [--limit=N]
//
// 여기서 나오는 건 '의심 목록'이지 오류 확정이 아니다. 반복 후렴이나 버전 차이 때문에
// 지금 가사가 맞을 수도 있으므로, 실제 교정은 /admin 가사 정확성 검토에서 공식 가사와
// 대조한 뒤 근거를 붙여 저장한다.
import { getAllSongs } from "../lib/songs.js";

const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "--limit=40").split("=")[1]);
const isNote = (t) => /^[🗨✏]/u.test(t || "");
const findings = [];
const add = (slug, kind, detail) => findings.push({ slug, kind, detail });

for (const s of getAllSongs()) {
  const lines = s.stanzas.flatMap((st) => st.lines);
  const orig = lines.map((l) => (l.en || "").trim()).filter((t) => t && !isNote(t));

  // 캡션 흔적 — 해시태그, 연도만 있는 줄, 게시 태그
  for (const l of lines) {
    const t = (l.en || "").trim();
    if (!t || isNote(t)) continue;
    if (/#\S/.test(t)) add(s.slug, "캡션 혼입", `해시태그: ${t.slice(0, 40)}`);
    else if (/^\(?\d{4}\)?$/.test(t)) add(s.slug, "캡션 혼입", `연도만 있는 줄: ${t}`);
    else if (/^\d{6}_\d{4}$/.test(t)) add(s.slug, "캡션 혼입", `게시 태그: ${t}`);
  }

  // 같은 줄이 세 번 넘게 연달아 나오면 붙여넣기 사고를 의심한다.
  // 두 번 반복은 후렴에서 흔해 신호가 되지 않는다.
  for (let i = 2; i < orig.length; i++)
    if (orig[i] && orig[i] === orig[i - 1] && orig[i] === orig[i - 2] && orig[i].length > 12)
      add(s.slug, "연속 중복", `3회 이상 반복: ${orig[i].slice(0, 40)}`);

  // 같은 원문에 다른 번역
  const byLine = new Map();
  for (const l of lines) {
    const k = (l.en || "").trim();
    if (!k || isNote(k) || !l.ko?.trim()) continue;
    if (!byLine.has(k)) byLine.set(k, new Set());
    byLine.get(k).add(l.ko.trim());
  }
  for (const [k, v] of byLine)
    if (v.size > 1) add(s.slug, "후렴 번역 불일치", `${k.slice(0, 30)} → ${[...v].map((x) => x.slice(0, 22)).join(" / ")}`);

  // 번역이 원문 그대로
  for (const l of lines)
    if (l.en?.trim() && l.ko?.trim() && l.en.trim() === l.ko.trim())
      add(s.slug, "번역=원문", l.en.trim().slice(0, 40));

  // 길이가 크게 어긋난 번역 — 여러 줄을 합쳤거나 빠뜨렸을 수 있다.
  // 기준은 번역 방향마다 다르다: 한국어는 같은 뜻을 영어보다 짧게 적고,
  // 반대로 한국어를 영어로 옮기면 글자 수가 두세 배로 늘어난다.
  for (const l of lines) {
    if (!l.en?.trim() || !l.ko?.trim() || l.koSpan > 1 || isNote(l.en)) continue;
    const a = l.en.replace(/\s/g, "").length, b = l.ko.replace(/\s/g, "").length;
    if (a < 12 || b < 12) continue;
    const koToEn = /[가-힣]/.test(l.en) && !/[가-힣]/.test(l.ko); // 원문이 한국어
    const over = koToEn ? b > a * 5 : b > a * 2.5;
    const under = koToEn ? b * 2 < a : b * 5 < a;
    if (over || under)
      add(s.slug, "번역 길이 이상", `${a}자 원문 ↔ ${b}자 번역: ${l.en.slice(0, 28)}`);
  }

  // 일본어 곡인데 원문에 가나·한자가 거의 없음 — 인식이 깨졌거나 lang이 틀렸다
  if (s.lang === "ja") {
    const cjk = orig.filter((t) => /[぀-ヿ㐀-鿿]/.test(t)).length;
    if (orig.length >= 6 && cjk / orig.length < 0.5)
      add(s.slug, "일본어 인식", `가나·한자 줄 ${cjk}/${orig.length}`);
  }
}

const byKind = new Map();
for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) || []), f]);
console.log(`의심 ${findings.length}건 / ${[...byKind.keys()].length}유형\n`);
for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`■ ${kind} — ${list.length}건`);
  for (const f of list.slice(0, LIMIT)) console.log(`   ${f.slug}: ${f.detail}`);
  if (list.length > LIMIT) console.log(`   … 외 ${list.length - LIMIT}건`);
  console.log();
}
