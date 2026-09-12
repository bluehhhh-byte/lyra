// 그라운딩 없이 수록 정보를 찾는 경로 — 무료 소스에서 후보를 모으고, 고르는
// 일만 일반 Gemini에게 맡긴다.
//   node --test lib/appearance-search.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  findAppearanceCandidates,
  itunesAppearanceCandidates,
  pickCandidate,
  sameRecording,
  suggestFromFreeSources,
  wikipediaAppearanceCandidates,
  workTitleFromAlbum,
  braveSearchResults,
  appearanceQuery,
} from "./admin/appearance-search.js";

const itunes = (results) => async () => ({ ok: true, json: async () => ({ results }) });

test("the work title is what is left after the soundtrack labelling", () => {
  // 꼬리표를 떼지 않으면 작품명 대조가 전부 빗나간다
  assert.equal(workTitleFromAlbum("또 오해영 (Original Television Soundtrack), Pt. 2"), "또 오해영");
  assert.equal(workTitleFromAlbum("Weak Hero Class 1 (Original Soundtrack)"), "Weak Hero Class 1");
  assert.equal(workTitleFromAlbum("미술관 옆 동물원 (Original Soundtrack) [Special Edition]"), "미술관 옆 동물원");
  assert.equal(workTitleFromAlbum("Forecasting Love and Weather (Original Television Soundtrack) Special"), "Forecasting Love and Weather Special");
});

test("a different recording's soundtrack is not borrowed", () => {
  // 검색 결과에 남의 곡이 섞여 들어오면 그 곡의 OST가 이 곡의 것이 된다
  assert.equal(sameRecording("이상기후 (Feat. 라비)", "이상기후"), true, "표기 차이는 같은 곡으로 본다");
  assert.equal(sameRecording("Homesick", "Homesick"), true);
  assert.equal(sameRecording("전혀 다른 곡", "이상기후"), false);
  assert.equal(sameRecording("", "이상기후"), false);
});

test("only soundtrack albums become candidates, and the URL comes from the API", async () => {
  const candidates = await itunesAppearanceCandidates("벤자민", "Homesick", {
    timeoutMs: 20,
    fetchImpl: itunes([
      { trackName: "Homesick", collectionName: "Weak Hero Class 1 (Original Soundtrack)", collectionViewUrl: "https://music.apple.com/album/1" },
      { trackName: "Homesick", collectionName: "벤자민 1집", collectionViewUrl: "https://music.apple.com/album/2" },
      { trackName: "다른 곡", collectionName: "남의 작품 (Original Soundtrack)", collectionViewUrl: "https://music.apple.com/album/3" },
    ]),
  });
  assert.equal(candidates.length, 1, "정규 앨범과 남의 곡은 후보가 아니다");
  assert.equal(candidates[0].work, "Weak Hero Class 1");
  // 근거 URL은 모델이 아니라 응답에서 온다 — 지어낼 수 없다
  assert.equal(candidates[0].uri, "https://music.apple.com/album/1");
  assert.equal(candidates[0].source, "itunes");
});

test("a song page is read, an artist page is not", async () => {
  // 아티스트 문서에는 그 아티스트의 모든 타이업이 적혀 있어 어느 것이 이 곡의
  // 것인지 가릴 수 없다 — 읽으면 추측이 된다
  const pages = [];
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    if (params.get("list") === "search")
      return { ok: true, json: async () => ({ query: { search: [{ title: "10-FEET" }, { title: "第ゼロ感" }] } }) };
    pages.push(params.get("titles"));
    return {
      ok: true,
      json: async () => ({ query: { pages: { 1: { extract: "映画『THE FIRST SLAM DUNK』のエンディングテーマである。" } } } }),
    };
  };
  const out = await wikipediaAppearanceCandidates("10-FEET", "第ゼロ感", "ja", { fetchImpl, timeoutMs: 20 });
  assert.deepEqual(pages, ["第ゼロ感"], "곡 문서만 읽는다");
  assert.equal(out[0].work, "THE FIRST SLAM DUNK");
  assert.match(out[0].uri, /ja\.wikipedia\.org/);
});

test("finding nothing is not the same as there being nothing", async () => {
  // 이 경로의 재현율은 22%다. 빈손을 "수록 정보 없음"으로 내보내면 거짓이 된다.
  const empty = async () => ({ ok: true, json: async () => ({ results: [], query: { search: [] } }) });
  const result = await suggestFromFreeSources(
    { key: "k", title: "무명곡", artist: "무명", lang: "ko", geminiText: async () => "{}" },
    { fetchImpl: empty, timeoutMs: 20 },
  );
  assert.equal(result.appearance, null);
  assert.equal(result.state, "needs_review", "empty로 내보내면 화면이 '없음'이라고 말한다");
  assert.match(result.warning, /없다는 뜻은 아니/);
});

test("the model may only choose among candidates, never invent one", () => {
  const candidates = [{ work: "또 오해영", uri: "https://music.apple.com/x", label: "album", source: "itunes", claim: "c" }];
  assert.equal(pickCandidate({ work: "또 오해영" }, candidates)?.work, "또 오해영");
  assert.equal(pickCandidate({ work: "지어낸 작품" }, candidates), null, "후보에 없으면 버린다");
  assert.equal(pickCandidate({ work: "" }, candidates), null, "확신 없으면 빈 문자열로 온다");
});

test("a chosen candidate keeps the source's URL, not the model's", async () => {
  const fetchImpl = async (url) =>
    String(url).includes("itunes")
      ? { ok: true, json: async () => ({ results: [{ trackName: "꿈처럼", collectionName: "또 오해영 (Original Television Soundtrack)", collectionViewUrl: "https://music.apple.com/real" }] }) }
      : { ok: true, json: async () => ({ query: { search: [] } }) };
  const result = await suggestFromFreeSources(
    {
      key: "k", title: "꿈처럼", artist: "벤", lang: "ko",
      geminiText: async () =>
        JSON.stringify({ work: "또 오해영", workType: "drama", role: "background", year: 2016, note: "n", evidenceClaim: "c", evidenceUrl: "https://지어낸.example" }),
    },
    { fetchImpl, timeoutMs: 20 },
  );
  assert.equal(result.state, "verified");
  assert.equal(result.appearance.evidenceUrl, "https://music.apple.com/real", "모델이 준 URL은 쓰지 않는다");
  assert.equal(result.appearance.mediaType, "tv", "drama는 tv다");
  assert.equal(result.appearance.role, "background");
});

test("an unparseable reply leaves the field blank rather than guessing", async () => {
  const fetchImpl = async (url) =>
    String(url).includes("itunes")
      ? { ok: true, json: async () => ({ results: [{ trackName: "곡", collectionName: "작품 (Original Soundtrack)", collectionViewUrl: "https://music.apple.com/a" }] }) }
      : { ok: true, json: async () => ({ query: { search: [] } }) };
  const result = await suggestFromFreeSources(
    { key: "k", title: "곡", artist: "가수", lang: "ko", geminiText: async () => "JSON이 아니다" },
    { fetchImpl, timeoutMs: 20 },
  );
  assert.equal(result.appearance, null);
  assert.equal(result.state, "needs_review");
  assert.equal(result.candidates.length, 1, "후보는 화면에 남겨 사람이 보게 한다");
});

test("a source that is down does not take the other one with it", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("itunes")) throw new Error("network");
    return { ok: true, json: async () => ({ query: { search: [] } }) };
  };
  assert.deepEqual(await findAppearanceCandidates({ artist: "a", title: "t", lang: "en" }, { fetchImpl, timeoutMs: 20 }), []);
});

// ── 일반 웹 검색 (BRAVE_API_KEY가 있을 때) ───────────────────────────────

test("without a key the search source stays out of the way", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  assert.deepEqual(await braveSearchResults("가수", "곡", { fetchImpl, timeoutMs: 20 }), []);
  assert.equal(called, false, "키가 없으면 부르지 않는다 — 402도 429도 만들지 않는다");
});

test("the search query names the song and the artist, in every language it might be labelled in", () => {
  const q = appearanceQuery("10-FEET", "第ゼロ感");
  assert.ok(q.includes('"10-FEET"') && q.includes('"第ゼロ感"'), "따옴표로 묶어 동명이곡을 줄인다");
  for (const word of ["OST", "soundtrack", "주제가", "主題歌"]) assert.ok(q.includes(word), word);
});

test("search results arrive as evidence with their snippets, tags stripped", async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(init.headers["X-Subscription-Token"], "brave-key");
    assert.ok(String(url).includes("api.search.brave.com"));
    return {
      ok: true,
      json: async () => ({
        web: { results: [{ url: "https://www.animate.co.jp/x", title: "第ゼロ感 — 主題歌", description: "映画<b>『THE FIRST SLAM DUNK』</b>の主題歌" }] },
      }),
    };
  };
  const [row] = await braveSearchResults("10-FEET", "第ゼロ感", { fetchImpl, timeoutMs: 20, apiKey: "brave-key" });
  assert.equal(row.uri, "https://www.animate.co.jp/x");
  assert.equal(row.snippet, "映画『THE FIRST SLAM DUNK』の主題歌", "HTML 태그는 지운다");
  assert.equal(row.source, "brave");
});

test("a work read out of a search snippet still cites a URL we supplied", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("brave"))
      return { ok: true, json: async () => ({ web: { results: [{ url: "https://official.example/ost", title: "공식", description: "이 곡은 영화 고질라의 삽입곡이다" }] } }) };
    if (String(url).includes("itunes")) return { ok: true, json: async () => ({ results: [] }) };
    return { ok: true, json: async () => ({ query: { search: [] } }) };
  };
  const result = await suggestFromFreeSources(
    {
      key: "k", title: "浸食", artist: "L'Arc-en-Ciel", lang: "ja", braveKey: "brave-key",
      geminiText: async () =>
        JSON.stringify({ work: "고질라", workType: "movie", role: "insert_song", year: null, note: "n", evidenceClaim: "c", evidenceUrl: "https://official.example/ost" }),
    },
    { fetchImpl, timeoutMs: 20 },
  );
  assert.equal(result.state, "verified");
  assert.equal(result.appearance.workTitle, "고질라", "작품명은 발췌에서 읽는다 — 후보에 미리 있지 않다");
  assert.equal(result.appearance.evidenceUrl, "https://official.example/ost");
});

test("a URL we never supplied is refused, however plausible the work", async () => {
  // 검색 경로에서는 작품명을 모델이 읽으므로, 주소까지 모델을 믿으면 지어낼 자리가 생긴다
  const fetchImpl = async (url) => {
    if (String(url).includes("brave"))
      return { ok: true, json: async () => ({ web: { results: [{ url: "https://real.example/a", title: "t", description: "영화 고질라의 삽입곡" }] } }) };
    if (String(url).includes("itunes")) return { ok: true, json: async () => ({ results: [] }) };
    return { ok: true, json: async () => ({ query: { search: [] } }) };
  };
  const result = await suggestFromFreeSources(
    {
      key: "k", title: "浸食", artist: "L'Arc-en-Ciel", lang: "ja", braveKey: "brave-key",
      geminiText: async () =>
        JSON.stringify({ work: "고질라", role: "insert_song", evidenceUrl: "https://지어낸.example/nope" }),
    },
    { fetchImpl, timeoutMs: 20 },
  );
  assert.equal(result.appearance, null, "준 적 없는 주소는 근거가 될 수 없다");
  assert.equal(result.state, "needs_review");
});
