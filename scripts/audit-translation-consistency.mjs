import assert from "node:assert/strict";
import fs from "node:fs";
import { getAllSongs } from "../lib/songs.js";

const SNAPSHOT_PATH = "data/translation-consistency-audit.json";
const REPORT_PATH = "docs/TRANSLATION-CONSISTENCY-AUDIT.md";
const CATEGORY_LABELS = {
  punctuation_spacing: "문장부호·공백",
  clear_error: "명백한 오류",
  style_drift: "문체 흔들림",
  context_justified: "맥락에 따른 정당한 차이",
  hold: "판단 보류",
};

const key = (slug, original) => `${slug}\u0000${original}`;
const compact = (text) => text.normalize("NFKC").replace(/[\p{P}\p{Z}\s]/gu, "");

const punctuationFixes = new Map([
  [key("l-arc-en-ciel-瞳の住人", "そばにいてずっと君の笑顔を見つめていたい"), "곁에 있어 줘 계속, 너의 미소를 바라보고 싶어"],
  [key("mac-ayres-i-ll-be-your-home-now", "Too much"), "많은 걸 바라는 걸까"],
  [key("arco-happy-new-year", "Holding on tight, millions all hoping"), "꼭 붙잡은 채 수많은 사람들이 기원한다"],
  [key("glay-missing-you", "聲を屆けてよいつものように"), "목소리를 들려줘, 언제나처럼"],
  [key("glay-missing-you", "今はまだ 容赦なく吹きすさぶ風に"), "지금은 아직 용서 없이 휘몰아치는 바람에"],
  [key("valley-the-problem-song", "Maybe we could start again"), "우리가 다시 시작할 수 있을 거래"],
  [key("valley-the-problem-song", "But I know we can fix them"), "우린 고칠 수 있을 거야"],
  [key("bon-jovi-this-ain-t-a-love-song", "Then I'm wrong, yeah I'm wrong"), "그럼 내가 틀린 거야, 그래, 나는 틀린 거야"],
  [key("dir-en-grey-理由-이유", "これ以上これ以上は傷つきたくない"), "이 이상은 더 이상은 상처받고 싶지 않아"],
  [key("chemistry-piece-of-a-dream", "指先にふれては感じる懷かしい痛みが"), "손끝으로 느끼고 나서야 느끼는 그리운 아픔이"],
  [key("kirinji-aliens", "魔法をかけてみせるさ"), "마법을 걸어 보이겠어"],
  [key("phoenix-love-for-granted", "Hang on to a little chance, you bet I'm in"), "작은 기회라도 준다면, 너의 제안을 받아들일게"],
]);

const clearErrors = new Map([
  [key("nafla-adrenaline", "너네들 다 먹어"), {
    fix: "너희들을 전부 다 먹어치워",
    reason: "반복 네 곳 중 두 곳의 번역이 목적어에서 잘려 있다.",
  }],
  [key("green-day-last-night-on-earth", "I'm sending all my love to you"), {
    fix: "내 모든 사랑을 너에게 보낼 거야",
    reason: "3행 번역 블록의 순서가 뒤바뀌어 이 원문에 ‘난 이 땅 위에 서 있어’가 붙었다.",
  }],
  [key("prince-bernald-i-want-a-man", "I want a man, I want a man"), {
    fix: "그런 남자를 원해, 남자를 말야",
    reason: "화자가 남자를 원한다는 원문을 화자가 남자가 되길 원한다는 뜻으로 잘못 옮겼다.",
  }],
  [key("phoenix-love-for-granted", "Don't tell me 'bout your secrets"), {
    fix: "말하지 말아 줘, 너의 비밀들",
    reason: "번역 span이 앞의 보이지 않는 줄까지 잘못 세어 lies와 secrets 번역이 한 줄로 합쳐졌다.",
  }],
]);

const contextJustified = new Set([
  key("フィ-ビ-ブリジャ-ズ-lost-boys", "Lost boys"),
  key("suede-trash", "We're the litter on the breeze,"),
  key("suede-trash", "We're the lovers on the street,"),
  key("damien-rice-blower-s-daughter", "My mind"),
  key("david-choi-love", "Love, love, love, love, love"),
  key("twice-what-is-love", "I wanna know"),
  key("nick-drake-day-is-done", "When the day is done"),
  key("zero-7-distractions", "From the truth, from the truth"),
  key("radiohead-weird-fishes-arpeggi", "And weird fishes"),
  key("더-폴스-moon-in-water", "Moon in water"),
  key("더-폴스-moon-in-water", "Wave in water"),
  key("혁오-ohio", "That we made before"),
]);

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

function minimumSimilarity(translations) {
  let minimum = 1;
  for (let i = 0; i < translations.length; i++) {
    for (let j = i + 1; j < translations.length; j++) {
      const a = compact(translations[i]);
      const b = compact(translations[j]);
      minimum = Math.min(minimum, 1 - distance(a, b) / Math.max(a.length, b.length, 1));
    }
  }
  return minimum;
}

function divergentRows(songs) {
  const rows = [];
  for (const song of songs) {
    const byOriginal = new Map();
    for (const [stanza, group] of song.stanzas.entries()) {
      for (const [line, lyric] of group.lines.entries()) {
        const original = lyric.en?.trim();
        const translation = lyric.ko?.trim();
        if (!original || !translation) continue;
        if (!byOriginal.has(original)) byOriginal.set(original, []);
        byOriginal.get(original).push({ stanza, line, translation });
      }
    }
    for (const [original, occurrences] of byOriginal) {
      const translations = [...new Set(occurrences.map((item) => item.translation))];
      if (translations.length < 2) continue;
      rows.push({
        id: key(song.slug, original),
        slug: song.slug,
        title: song.title,
        artist: song.artist,
        original,
        translations,
        occurrences,
      });
    }
  }
  return rows;
}

function classify(row) {
  if (new Set(row.translations.map(compact)).size === 1) {
    return {
      category: "punctuation_spacing",
      reason: "공백과 문장부호를 제거하면 번역 문자열이 같다.",
      fix: punctuationFixes.get(row.id),
    };
  }
  if (clearErrors.has(row.id)) return { category: "clear_error", ...clearErrors.get(row.id) };
  if (contextJustified.has(row.id)) {
    return {
      category: "context_justified",
      reason: "반복 위치의 앞뒤 문장에 맞춰 조사·어미·생략 대상을 달리한 번역이다.",
    };
  }
  if (minimumSimilarity(row.translations) >= 0.55) {
    return {
      category: "style_drift",
      reason: "핵심 뜻은 유지되지만 수식어·존대·어휘 선택이 흔들린다.",
    };
  }
  return {
    category: "hold",
    reason: "번역 사이의 의미 차이가 커 자동 통일하지 않고 원문 문맥 판단 대상으로 남긴다.",
  };
}

const echoTranslations = new Map([
  [key("새소년-긴-꿈", "I want to shoot a movie with you"), "너와 함께 영화를 찍고 싶어"],
  [key("새소년-긴-꿈", "Hold your hand and walk, run, fly with you"), "네 손을 잡고 걷고, 달리고, 너와 날고 싶어"],
  [key("새소년-긴-꿈", "Why am I blooming when I look at you"), "왜 너를 바라보면 내가 피어날까"],
  [key("새소년-긴-꿈", "I can change the world to be with you"), "너와 함께라면 세상을 바꿀 수 있어"],
  [key("새소년-긴-꿈", "So take my hand and walk run fly with you"), "그러니 내 손을 잡고 함께 걷고, 달리고, 날아가자"],
  [key("henry-young-ashley-alisha-one-more-last-time", "One more last time"), "마지막으로 한 번만 더"],
  [key("검정치마-폭죽과-풍선들", "Oh, look at 'em go baby go"), "오, 저것들 날아가는 것 좀 봐, 자 가자"],
  [key("오존-clouds", "Maybe I'll make you feel good"), "어쩌면 내가 널 기분 좋게 해줄지도 몰라"],
  [key("rude-john-find-your-love", "Find your love"), "너의 사랑을 찾아"],
  [key("아일릿-빌려온-고양이", "So curious"), "너무 궁금해"],
  [key("아일릿-빌려온-고양이", "So fabulous"), "너무 멋져"],
  [key("아일릿-빌려온-고양이", "Like a roller coaster ride"), "롤러코스터를 타는 것처럼"],
  [key("아일릿-빌려온-고양이", "My heart starts to"), "내 심장이 움직이기 시작해"],
  [key("아일릿-빌려온-고양이", "Do you wanna dance?"), "춤추고 싶어?"],
]);

function echoReview(songs) {
  const review = [];
  for (const song of songs) {
    const echoes = new Map();
    for (const group of song.stanzas) {
      for (const lyric of group.lines) {
        const original = lyric.en?.trim();
        const translation = lyric.ko?.trim();
        if (original && translation && original === translation) {
          echoes.set(original, (echoes.get(original) || 0) + 1);
        }
      }
    }
    for (const [original, occurrences] of echoes) {
      const replacement = echoTranslations.get(key(song.slug, original));
      review.push({
        slug: song.slug,
        title: song.title,
        artist: song.artist,
        original,
        occurrences,
        decision: replacement ? "fill_missing" : "retain",
        replacement,
        reason: replacement
          ? "뜻이 있는 영어 가사인데 번역 자리에 원문이 복사돼 있다."
          : "고유명사·제목 훅·감탄사·보컬라이즈·한국어 원문이라 그대로 둔다.",
      });
    }
  }
  return review;
}

function missingMetadata(songs) {
  return songs
    .filter((song) => !song.emotion || !song.keywords?.length)
    .map((song) => ({
      slug: song.slug,
      title: song.title,
      missing: [!song.emotion && "emotion", !song.keywords?.length && "keywords"].filter(Boolean),
    }));
}

function counts(records) {
  return Object.fromEntries(Object.keys(CATEGORY_LABELS).map((category) => [
    category,
    records.filter((record) => record.category === category).length,
  ]));
}

function markdown(snapshot) {
  const lines = [
    "# 번역 일관성 감사",
    "",
    `감사 기준: ${snapshot.capturedAt} · ${snapshot.songCount}곡의 불일치 ${snapshot.records.length}구절`,
    "",
    "## 요약",
    "",
    "| 유형 | 건수 | 처리 |",
    "|---|---:|---|",
  ];
  for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
    const action = ["punctuation_spacing", "clear_error"].includes(category) ? "수정" : "유지";
    lines.push(`| ${label} | ${snapshot.counts[category]} | ${action} |`);
  }
  for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
    lines.push("", `## ${label} (${snapshot.counts[category]})`, "");
    for (const record of snapshot.records.filter((item) => item.category === category)) {
      const variants = record.translations.map((translation) => `\`${translation}\``).join(" / ");
      lines.push(`- **${record.artist} — ${record.title}** · \`${record.original}\` → ${variants}`);
      lines.push(`  - ${record.reason}${record.fix ? ` 통일값: \`${record.fix}\`` : ""}`);
    }
  }
  const echoSongs = new Set(snapshot.echoReview.map((item) => item.slug)).size;
  const echoOccurrences = snapshot.echoReview.reduce((sum, item) => sum + item.occurrences, 0);
  const filledItems = snapshot.echoReview.filter((item) => item.decision === "fill_missing");
  const filledOccurrences = filledItems.reduce((sum, item) => sum + item.occurrences, 0);
  lines.push("", "## 원문과 동일한 번역 검토", "");
  lines.push(`${echoSongs}곡의 경고 ${echoOccurrences}줄을 검토해 뜻이 있는 영어 가사 ${filledItems.length}종 ${filledOccurrences}줄만 보완하고, 나머지는 유지한다.`, "");
  for (const item of snapshot.echoReview) {
    const action = item.decision === "fill_missing" ? `누락 보완 → \`${item.replacement}\`` : "유지";
    lines.push(`- **${item.artist} — ${item.title}** · \`${item.original}\` (${item.occurrences}회): ${action} — ${item.reason}`);
  }
  lines.push("", "## emotion·keywords 누락(범위 밖)", "");
  for (const item of snapshot.missingMetadata) {
    lines.push(`- ${item.slug}: ${item.missing.join(", ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

const songs = getAllSongs();

if (process.argv.includes("--capture")) {
  assert.ok(!fs.existsSync(SNAPSHOT_PATH), `${SNAPSHOT_PATH}가 이미 있습니다`);
  const records = divergentRows(songs).map((row) => ({ ...row, ...classify(row) }));
  assert.equal(records.length, 258, "감사 대상 구절 수가 실측 258과 달라졌습니다");
  assert.equal(new Set(records.map((record) => record.id)).size, records.length, "감사 ID가 중복됩니다");
  assert.equal(records.filter((record) => record.category === "punctuation_spacing").length, 12,
    "문장부호·공백 항목 수가 실측 12와 다릅니다");
  const snapshot = {
    capturedAt: new Date().toISOString(),
    songCount: new Set(records.map((record) => record.slug)).size,
    counts: counts(records),
    records,
    echoReview: echoReview(songs),
    missingMetadata: missingMetadata(songs),
  };
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  fs.writeFileSync(REPORT_PATH, markdown(snapshot));
  console.log(JSON.stringify({ records: records.length, songs: snapshot.songCount, counts: snapshot.counts }));
  console.log("translation consistency audit captured");
} else if (process.argv.includes("--reclassify")) {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  snapshot.records = snapshot.records.map((record) => ({ ...record, ...classify(record) }));
  snapshot.counts = counts(snapshot.records);
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  fs.writeFileSync(REPORT_PATH, markdown(snapshot));
  console.log(JSON.stringify({ records: snapshot.records.length, counts: snapshot.counts }));
  console.log("translation consistency audit reclassified");
} else if (process.argv.includes("--render")) {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  fs.writeFileSync(REPORT_PATH, markdown(snapshot));
  console.log("translation consistency report rendered");
} else {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  assert.equal(snapshot.records.length, 258, "258구절이 모두 기록되어야 합니다");
  assert.equal(snapshot.songCount, 150, "감사 대상은 150곡이어야 합니다");
  assert.equal(new Set(snapshot.records.map((record) => record.id)).size, 258, "감사 ID가 중복됩니다");
  assert.deepEqual(snapshot.counts, counts(snapshot.records), "분류 집계가 레코드와 다릅니다");
  for (const category of Object.keys(CATEGORY_LABELS)) {
    assert.ok(snapshot.counts[category] >= 3, `${CATEGORY_LABELS[category]} 사례가 3건 미만입니다`);
  }
  const current = new Map(songs.map((song) => [song.slug, song]));
  for (const record of snapshot.records) {
    const song = current.get(record.slug);
    assert.ok(song, `${record.slug}: 곡이 사라졌습니다`);
    const occurrences = song.stanzas.flatMap((group) => group.lines)
      .filter((lyric) => lyric.en?.trim() === record.original).length;
    assert.equal(occurrences, record.occurrences.length, `${record.id}: 원문 발생 횟수가 달라졌습니다`);
  }
  assert.equal(markdown(snapshot), fs.readFileSync(REPORT_PATH, "utf8"), "감사 보고서가 snapshot과 다릅니다");
  console.log(JSON.stringify({ records: snapshot.records.length, songs: snapshot.songCount, counts: snapshot.counts }));
  console.log("translation consistency audit verified");
}
