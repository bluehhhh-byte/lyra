import assert from "node:assert/strict";
import { researchSongContext } from "./admin/song-appearance-suggest.js";

const realFetch = globalThis.fetch;
let sentPrompt = "";
const grounded = ({ supported = true } = {}) => Response.json({
  candidates: [{
    content: { parts: [{ text: JSON.stringify({
      comment: "영화 《고질라》의 삽입곡이라는 배경이 통제를 잃는 가사의 파괴감을 화면 바깥까지 밀어낸다.",
      appearance: {
        found: true,
        workTitle: "고질라",
        originalTitle: "Godzilla",
        workType: "movie",
        role: "insert_song",
        year: 1998,
        season: null,
        episode: null,
        note: "일본판 공식 사운드트랙 수록",
        evidenceUrl: "https://larc-en-ciel.com/official-discography",
      },
    }) }] },
    groundingMetadata: {
      webSearchQueries: ["浸食 lose control GODZILLA 挿入歌"],
      groundingChunks: [
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
  assert.equal(research.appearance.workTitle, "고질라");
  assert.equal(research.appearance.role, "insert_song", "주제가와 삽입곡을 섞지 않는다");
  assert.equal(research.appearance.evidenceUrl, "https://larc-en-ciel.com/official-discography");
  assert.equal(research.appearance.status, "verified");
  assert.match(sentPrompt, /기존 AI 코멘트의 후보 단서/);
  assert.match(sentPrompt, /사실로 간주하지 말고 웹에서 다시 검증/);
  assert.match(sentPrompt, /タイアップ\/主題歌\/挿入歌/);
  assert.match(sentPrompt, /공식 사운드트랙 수록.*주제가.*삽입곡/s);

  globalThis.fetch = async () => grounded({ supported: false });
  const unsupported = await researchSongContext({
    key: "test-key",
    title: "Unknown",
    artist: "Unknown",
    lyrics: "unknown",
  });
  assert.equal(unsupported, null, "근거 연결이 없는 외부 사실과 작품 정보는 검색 실패로 거부한다");
} finally {
  globalThis.fetch = realFetch;
}

console.log("grounded song research tests passed");
