// 최신 기록 날짜의 감정 분석 — 새 곡을 올리면 별도 작업 없이 대상이 바뀌어야 한다.
//   node lib/latest-day.test.mjs
import assert from "node:assert/strict";
import { dayInsights, latestDayInsight, latestRecordedDay, workLabel } from "./latest-day.js";

const song = (slug, published, emotion, extra = {}) => ({
  slug, title: `T-${slug}`, artist: `A-${slug}`, published, emotion, keywords: ["밤", "꿈"], ...extra,
});
const movie = (slug, published, extra = {}) => ({
  slug, title: `M-${slug}`, director: `D-${slug}`, published, rating: 4, themes: ["기억"], ...extra,
});

// 최신 날짜를 songs와 movies 전체에서 고르고, 그 날 항목만 함께 집계한다
{
  const r = latestDayInsight(
    [song("a", "2026-08-15T01:00:00Z", "불안"), song("b", "2026-08-15T05:00:00Z", "저항"),
     song("c", "2026-08-15T06:00:00Z", "희망"), song("old", "2026-08-01T00:00:00Z", "슬픔")],
    [movie("m", "2026-08-15T02:00:00Z"), movie("mold", "2026-07-01T00:00:00Z")]
  );
  assert.equal(r.day, "2026-08-15");
  assert.equal(r.music, 3, "그날 곡만");
  assert.equal(r.movies, 1, "그날 영화만");
  assert.equal(r.center.n, 3);
  assert.ok(r.center.a > 0, "불안·저항은 고각성");
  assert.deepEqual(r.keywords.map(([k]) => k), ["꿈", "밤"]);
  assert.deepEqual(r.themes.map(([t]) => t), ["기억"]);
  assert.match(r.text, /음악 3곡과 영화 1편/);
  assert.match(r.text, /밝기 -?\d\.\d · 각성 \d\.\d/);
  assert.match(r.text, /'꿈'/);
  assert.ok(!/당신|우울|불안장애|조증/.test(r.text), "사람을 판정하거나 임상 용어를 쓰지 않는다");
}
console.log("✓ 최신 날짜 선택·집계");

// 영화가 최신이면 영화 날짜가 대상이 된다 — songs만 보지 않는다
{
  const r = latestDayInsight([song("a", "2026-08-10T00:00:00Z", "사랑")], [movie("m", "2026-08-20T00:00:00Z")]);
  assert.equal(r.day, "2026-08-20");
  assert.equal(r.music, 0);
  assert.equal(r.movies, 1);
  assert.match(r.text, /영화 1편/);
  assert.match(r.text, /M-m — D-m/, "영화는 제목 — 감독");
  assert.ok(!/밝기/.test(r.text), "감정 태그가 없으면 좌표를 지어내지 않는다");
}
console.log("✓ 영화만 있는 날");

// 새 날짜의 곡을 넣으면 분석 대상이 자동으로 바뀐다 — 저장된 결과가 아니다
{
  const base = [song("a", "2026-08-15T00:00:00Z", "고독")];
  const before = latestDayInsight(base, []);
  const after = latestDayInsight([...base, song("new", "2026-08-18T00:00:00Z", "기쁨")], []);
  assert.equal(before.day, "2026-08-15");
  assert.equal(after.day, "2026-08-18");
  assert.equal(after.dominant, "기쁨");
  assert.equal(after.repSong.slug, "new");
  // 같은 입력이면 같은 문장 — 빌드마다 흔들리지 않는다
  assert.equal(latestDayInsight([...base], []).text, before.text);
}
console.log("✓ 새 업로드 자동 반영·결정적 출력");

// 최신 하루만 버리지 않고 날짜별 리포트를 오래된 순서로 모두 돌려준다
{
  const reports = dayInsights(
    [song("old", "2026-08-01T00:00:00Z", "슬픔"), song("new", "2026-08-03T00:00:00Z", "기쁨")],
    [movie("middle", "2026-08-02T00:00:00Z")]
  );
  assert.deepEqual(reports.map((report) => report.day), ["2026-08-01", "2026-08-02", "2026-08-03"]);
  assert.match(reports[0].text, /T-old/);
  assert.match(reports[1].text, /M-middle/);
}
console.log("✓ 날짜별 리포트 누적");

// 표본이 적으면 하루 전체로 확대하지 않는다
{
  const r = latestDayInsight([song("a", "2026-08-15T00:00:00Z", "불안")], []);
  assert.equal(r.sparse, true);
  assert.match(r.text, /한 곡/);
  assert.match(r.text, /하루의 흐름을 말하기는 어렵다/);
}
console.log("✓ 표본 1곡 판단 유보");

// 음악만 있는 날 · 대표작은 실제 그날 데이터에 있다
{
  const r = latestDayInsight(
    [song("x", "2026-08-15T01:00:00Z", "위로"), song("y", "2026-08-15T03:00:00Z", "위로"), song("z", "2026-08-15T02:00:00Z", "회상")],
    []
  );
  assert.equal(r.movies, 0);
  assert.equal(r.repMovie, null);
  assert.equal(r.dominant, "위로");
  assert.equal(r.repSong.slug, "y", "dominant 감정의 곡 중 가장 최근");
  assert.equal(workLabel(r.repSong), "A-y — T-y", "음악은 아티스트 — 제목");
  assert.match(r.text, /A-y — T-y/);
}
console.log("✓ 음악만 있는 날·대표작 실존");

// 감정 태그가 하나도 없으면 작품과 키워드로만 설명한다
{
  const r = latestDayInsight([song("n", "2026-08-15T00:00:00Z", "")], []);
  assert.equal(r.dominant, "");
  assert.ok(!/정서 좌표/.test(r.text));
  assert.match(r.text, /'?꿈'?|밤/);
}

// KST 날짜 경계 — UTC 15:00 이후는 다음 날 한국 날짜다
{
  const r = latestDayInsight([song("late", "2026-08-15T15:30:00Z", "사랑"), song("early", "2026-08-15T14:00:00Z", "슬픔")], []);
  assert.equal(r.day, "2026-08-16", "UTC 15:30 → KST 8월 16일");
  assert.equal(r.music, 1, "같은 UTC 날짜라도 KST 날짜가 다르면 함께 세지 않는다");
  assert.equal(r.repSong.slug, "late");
}
console.log("✓ 감정 없는 날·KST 경계");

// 서술 재료는 실제 가사와 설명글, 해석의 축은 감정 분포와 좌표다
{
  const r = latestDayInsight([
    song("lyric-a", "2026-08-21T01:00:00Z", "불안", {
      title: "파도",
      comment: "흔들리는 관계를 밤바다의 파도에 빗대어 풀어낸 곡이다. 뒤 문장은 생략한다.",
      keywords: ["파도", "마음"],
      stanzas: [{ lines: [
        { en: "The waves keep coming", ko: "검은 파도가 계속 밀려온다" },
        { en: "My heart has nowhere to go", ko: "마음은 갈 곳을 찾지 못한다" },
      ] }],
    }),
    song("lyric-b", "2026-08-21T02:00:00Z", "불안", {
      title: "새벽",
      comment: "새벽까지 이어지는 기다림과 긴장을 담는다.",
      keywords: ["새벽"],
      stanzas: [{ lines: [{ en: "Wait until dawn", ko: "새벽이 올 때까지 문 앞에서 기다린다" }] }],
    }),
    song("lyric-c", "2026-08-21T03:00:00Z", "사랑", {
      keywords: ["손"],
      stanzas: [{ lines: [{ en: "Hold my hand", ko: "놓치지 않도록 손을 잡는다" }] }],
    }),
  ], []);
  assert.match(r.text, /감정은 불안을 중심으로 사랑/);
  assert.match(r.text, /밝기 -?\d\.\d · 각성 \d\.\d/);
  assert.match(r.text, /검은 파도가 계속 밀려온다/);
  assert.match(r.text, /새벽이 올 때까지 문 앞에서 기다린다/);
  assert.match(r.text, /설명글에서는 파도: .*밤바다의 파도/);
  assert.ok(r.text.indexOf("감정은") < r.text.indexOf("가사에는"), "분석의 축은 감정이고 가사는 근거로 뒤따라야 한다");
}
console.log("✓ 오늘의 기록 — 감정 중심 분석·가사와 설명글 근거");

assert.equal(
  latestRecordedDay([song("late", "2026-08-22T15:00:00Z", "사랑")], [movie("old", "2026-08-20T00:00:00Z")]),
  "2026-08-23"
);

// 기록이 전혀 없으면 섹션 자체가 없다
assert.equal(latestDayInsight([], []), null);
assert.equal(latestDayInsight([{ slug: "no-date", title: "x", artist: "y" }], []), null);

console.log("all passed");
