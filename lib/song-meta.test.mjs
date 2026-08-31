import assert from "node:assert/strict";
import { commentPrompt, computeAuto, TITLE_KO_RULE } from "./admin/song-meta.js";

assert.match(TITLE_KO_RULE, /한글 독음이나 발음 표기가 아니라/);
assert.match(TITLE_KO_RULE, /Yesterday→어제/);
assert.match(TITLE_KO_RULE, /예스터데이 금지/);
assert.match(TITLE_KO_RULE, /忘れらんねえよ→잊을 수 없어/);

const prompt = commentPrompt("The Crying Machine", "Steve Vai", "");
assert.match(prompt, /가사가 없는 연주곡/);
assert.match(prompt, /구성·연주·음색·분위기/);
assert.doesNotMatch(prompt, /가사의 의미와/);

// 가사가 비어 있어도 연주곡이면 Gemini를 호출해 한글 제목과 코멘트를 받는다.
// keywords는 번역 가사에서만 뽑는 값이므로 이 경로에서는 생성하지 않는다.
{
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  let sentPrompt = "";
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = async (_url, init) => {
    sentPrompt = JSON.parse(init.body).contents[0].parts[0].text;
    return Response.json({
      candidates: [{
        content: { parts: [{ text: JSON.stringify({
          country: "영미",
          genre: "Rock",
          titleKo: "우는 기계",
          artistKo: "",
          comment: "기타 선율이 사람의 울음처럼 굽이치며 기계와 감정의 경계를 흐린다.",
        }) }] },
      }],
    });
  };

  try {
    const result = await computeAuto({
      title: "The Crying Machine",
      artist: "Steve Vai",
      lyrics: "",
      lang: "en",
      album: "Fire Garden",
      year: "1996",
      genre: "Rock",
      instrumental: true,
    });
    assert.equal(result.aiOk, true);
    assert.equal(result.titleKo, "우는 기계");
    assert.match(result.comment, /기타 선율/);
    assert.deepEqual(result.keywords, []);
    assert.match(sentPrompt, /가사가 없는 연주곡/);
    assert.match(sentPrompt, /구성·연주·음색/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
}

console.log("✓ 연주곡 메타 자동 생성");
