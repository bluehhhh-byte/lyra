import assert from "node:assert/strict";
import { researchSongContext } from "./admin/song-appearance-suggest.js";

const realFetch = globalThis.fetch;
let sentPrompt = "";
const grounded = ({ supported = true, payload, chunks } = {}) => Response.json({
  candidates: [{
    content: { parts: [{ text: JSON.stringify(payload || {
      comment: "영화 《고질라》의 삽입곡이라는 배경이 통제를 잃는 가사의 파괴감을 화면 바깥까지 밀어낸다.",
      commentBasis: "web_enriched",
      commentEvidenceUrls: ["https://larc-en-ciel.com/official-discography"],
      appearance: {
        found: true,
        conflict: false,
        workTitle: "고질라",
        originalTitle: "Godzilla",
        workType: "movie",
        role: "insert_song",
        year: 1998,
        season: null,
        episode: null,
        note: "일본판 공식 사운드트랙 수록",
        evidenceClaim: "영화 GODZILLA 삽입곡",
        evidenceUrl: "https://larc-en-ciel.com/official-discography",
      },
    }) }] },
    groundingMetadata: {
      webSearchQueries: ["浸食 lose control GODZILLA 挿入歌"],
      groundingChunks: chunks || [
        { web: { uri: "https://larc-en-ciel.com/official-discography", title: "L'Arc-en-Ciel Official Discography" } },
        { web: { uri: "https://en.wikipedia.org/example", title: "Wikipedia" } },
      ],
      groundingSupports: supported ? [{ groundingChunkIndices: [0, 1] }] : [],
      searchEntryPoint: { renderedContent: "<div>Google Search</div>" },
    },
  }],
});

try {
  globalThis.fetch = async (_url, init) => {
    sentPrompt = JSON.parse(init.body).contents[0].parts[0].text;
    return grounded();
  };
  const research = await researchSongContext({
    key: "test-key",
    title: "浸食 〜lose control〜",
    artist: "L'Arc-en-Ciel",
    album: "浸食 〜lose control〜 - Single",
    year: 1998,
    lyrics: "I lose control / 崩れてゆく",
    commentHint: "영화 고질라의 주제가라고 알려져 있다.",
  });
  assert.match(research.comment, /고질라/);
  assert.equal(research.commentBasis, "web_enriched");
  assert.deepEqual(research.commentSources.map((source) => source.uri), ["https://larc-en-ciel.com/official-discography"]);
  assert.equal(research.appearance.workTitle, "고질라");
  assert.equal(research.appearance.role, "insert_song", "주제가와 삽입곡을 섞지 않는다");
  assert.equal(research.appearance.evidenceUrl, "https://larc-en-ciel.com/official-discography");
  assert.equal(research.appearance.status, "verified");
  assert.match(sentPrompt, /기존 AI 코멘트의 후보 단서/);
  assert.match(sentPrompt, /사실로 간주하지 말고 웹에서 다시 검증/);
  assert.match(sentPrompt, /タイアップ\/主題歌\/挿入歌/);
  assert.match(sentPrompt, /공식 사운드트랙 수록.*주제가.*삽입곡/s);
  assert.match(sentPrompt, /commentEvidenceUrls/);
  assert.match(sentPrompt, /conflict/);

  globalThis.fetch = async () => grounded({
    supported: false,
    payload: {
      comment: "가사의 무너지는 이미지만 따라가도 통제를 잃는 감각이 선명하다.",
      commentBasis: "lyrics_only",
      commentEvidenceUrls: [],
      appearance: { found: false, conflict: false },
    },
  });
  const lyricOnly = await researchSongContext({
    key: "test-key",
    title: "Unknown",
    artist: "Unknown",
    lyrics: "unknown",
  });
  assert.match(lyricOnly.comment, /가사의/);
  assert.equal(lyricOnly.commentBasis, "lyrics_only");
  assert.deepEqual(lyricOnly.commentSources, []);

  globalThis.fetch = async () => grounded({
    payload: {
      comment: "영화에 쓰였다는 사실이 곡의 의미를 바꾼다.",
      commentBasis: "web_enriched",
      commentEvidenceUrls: ["https://invented.example/fake"],
      appearance: {
        found: true, conflict: false, workTitle: "고질라", workType: "movie", role: "main_theme",
        evidenceUrl: "https://invented.example/fake",
      },
    },
  });
  const mismatched = await researchSongContext({ key: "test-key", title: "Unknown", artist: "Unknown", lyrics: "unknown" });
  assert.equal(mismatched.comment, "", "grounding 목록에 없는 URL은 코멘트 근거가 될 수 없다");
  assert.equal(mismatched.appearance, null, "무관한 grounding 출처를 임의의 대체 근거로 붙이지 않는다");
  assert.equal(mismatched.appearanceState, "needs_review");

  globalThis.fetch = async () => grounded({
    payload: {
      comment: "가사 이미지는 잔잔하게 가라앉는다.",
      commentBasis: "lyrics_only",
      commentEvidenceUrls: [],
      appearance: {
        found: true, conflict: false, workTitle: "Some Film", workType: "movie", role: "insert_song",
        evidenceClaim: "팬 위키에 삽입곡으로 적힘", evidenceUrl: "https://example.fandom.com/wiki/song",
      },
    },
    chunks: [{ web: { uri: "https://example.fandom.com/wiki/song", title: "Fan Wiki" } }],
  });
  const weakOnly = await researchSongContext({ key: "test-key", title: "Unknown", artist: "Unknown", lyrics: "unknown" });
  assert.equal(weakOnly.appearance, null, "팬 위키만으로 verified 작품 연결을 만들지 않는다");
  assert.equal(weakOnly.appearanceState, "needs_review");

  globalThis.fetch = async () => grounded({
    payload: {
      comment: "가사 이미지는 잔잔하게 가라앉는다.", commentBasis: "lyrics_only", commentEvidenceUrls: [],
      appearance: {
        found: true, conflict: true, workTitle: "Conflicted Film", workType: "movie", role: "insert_song",
        evidenceClaim: "자료마다 역할이 다름", evidenceUrl: "https://larc-en-ciel.com/official-discography",
      },
    },
  });
  const conflicted = await researchSongContext({ key: "test-key", title: "Unknown", artist: "Unknown", lyrics: "unknown" });
  assert.equal(conflicted.appearance, null, "출처가 충돌하면 자동 확정하지 않는다");
  assert.equal(conflicted.appearanceState, "needs_review");

  const directSource = "https://official.example/soundtrack";
  globalThis.fetch = async (url) => {
    if (String(url).includes("generativelanguage.googleapis.com")) return grounded({
      payload: {
        comment: "공식 제작 배경이 가사의 긴장을 더 선명하게 만든다.",
        commentBasis: "web_enriched",
        commentEvidenceUrls: [directSource],
        appearance: {
          found: true, conflict: false, workTitle: "Example Film", workType: "movie", role: "insert_song",
          evidenceClaim: "공식 사운드트랙 삽입곡", evidenceUrl: directSource,
        },
      },
      chunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/token", title: "Official Soundtrack" } }],
    });
    return { url: directSource, body: { cancel: async () => {} } };
  };
  const redirected = await researchSongContext({ key: "test-key", title: "Example Song", artist: "Example Artist", lyrics: "unknown" });
  assert.equal(redirected.appearance.evidenceUrl, directSource, "Google grounding redirect는 저장 가능한 원문 URL로 해소한다");
  assert.equal(redirected.commentSources[0].uri, directSource);
} finally {
  globalThis.fetch = realFetch;
}

console.log("grounded song research provenance tests passed");
