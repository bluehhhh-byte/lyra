import assert from "node:assert/strict";
import { sourceSupportsSong, suggestSongAppearance } from "./admin/song-appearance-suggest.js";

assert.equal(sourceSupportsSong(
  { uri: "https://music.example/reviews/lemon-kenshi-yonezu", title: "Lemon — Kenshi Yonezu review", quality: "editorial" },
  { title: "Lemon", artist: "Kenshi Yonezu" },
), true);
assert.equal(sourceSupportsSong(
  { uri: "https://news.example/general/article", title: "A completely unrelated article", quality: "editorial" },
  { title: "Lemon", artist: "Kenshi Yonezu" },
), false);

const realFetch = globalThis.fetch;
const grounded = (withSupport = true) => Response.json({
  candidates: [{
    content: { parts: [{ text: JSON.stringify({
      found: true,
      conflict: false,
      workTitle: "더 퍼스트 슬램덩크",
      originalTitle: "THE FIRST SLAM DUNK",
      workType: "anime_movie",
      role: "ending",
      year: 2022,
      season: null,
      episode: null,
      note: "",
      evidenceClaim: "영화 공식 엔딩 주제가",
      evidenceUrl: "https://movie.example/music",
    }) }] },
    groundingMetadata: {
      webSearchQueries: ["第ゼロ感 THE FIRST SLAM DUNK ending theme"],
      groundingChunks: [{ web: { uri: "https://movie.example/music", title: "第ゼロ感｜THE FIRST SLAM DUNK 공식 음악 정보" } }],
      groundingSupports: withSupport ? [{ groundingChunkIndices: [0] }] : [],
      searchEntryPoint: { renderedContent: "<div>Google Search</div>" },
    },
  }],
});

try {
  globalThis.fetch = async () => grounded(true);
  const suggestion = await suggestSongAppearance({
    key: "test-key",
    title: "第ゼロ感",
    artist: "10-FEET",
    album: "第ゼロ感",
    year: 2022,
  });
  assert.equal(suggestion.workTitle, "더 퍼스트 슬램덩크");
  assert.equal(suggestion.workType, "anime_movie");
  assert.equal(suggestion.role, "ending");
  assert.equal(suggestion.evidenceUrl, "https://movie.example/music");
  assert.equal(suggestion.status, "verified");
  assert.equal(suggestion.season, null);
  assert.equal(suggestion.episode, null);
  assert.match(suggestion.searchEntryPoint, /Google Search/);

  globalThis.fetch = async () => grounded(false);
  assert.equal(
    await suggestSongAppearance({ key: "test-key", title: "Unknown", artist: "Unknown" }),
    null,
    "grounding 출처가 없으면 모델이 found=true라 해도 자동 입력하지 않는다"
  );

  globalThis.fetch = async () => Response.json({
    candidates: [{
      content: { parts: [{ text: JSON.stringify({
        found: true, workTitle: "더 퍼스트 슬램덩크", workType: "anime_movie", role: "ending",
        evidenceClaim: "공식 엔딩 주제가", evidenceUrl: "https://stackoverflow.com/questions/123/music",
      }) }] },
      groundingMetadata: {
        groundingChunks: [{ web: { uri: "https://stackoverflow.com/questions/123/music", title: "How to fix a missing audio error" } }],
        groundingSupports: [{ groundingChunkIndices: [0] }],
      },
    }],
  });
  assert.equal(
    await suggestSongAppearance({ key: "test-key", title: "第ゼロ感", artist: "10-FEET" }),
    null,
    "음악과 무관한 기술지원 출처는 자동 수록정보의 근거가 될 수 없다"
  );
} finally {
  globalThis.fetch = realFetch;
}

console.log("✓ 곡 작품 수록 정보의 근거 기반 자동 검색");
