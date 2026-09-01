import assert from "node:assert/strict";
import { suggestSongAppearance } from "./admin/song-appearance-suggest.js";

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
      groundingChunks: [{ web: { uri: "https://movie.example/music", title: "영화 공식 음악 정보" } }],
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
} finally {
  globalThis.fetch = realFetch;
}

console.log("✓ 곡 작품 수록 정보의 근거 기반 자동 검색");
