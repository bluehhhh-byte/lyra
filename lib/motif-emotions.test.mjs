import assert from "node:assert/strict";
import { motifEmotionProfiles } from "./motif-emotions.js";

const song = (slug, ko, emotion) => ({ slug, emotion, stanzas: [{ lines: [{ ko }] }] });
const motifs = [{ keywords: ["밤", "파도", "밤"] }];
const songs = [
  song("a", "밤의 파도", "슬픔"), song("b", "깊은 밤", "고독"), song("c", "밤", "회상"),
  song("d", "파도", "기쁨"), song("e", "파도", ""),
];
const first = motifEmotionProfiles(motifs, songs);
const second = motifEmotionProfiles(motifs, songs);
assert.deepEqual(first, second, "같은 입력의 결과와 정렬은 결정적");
assert.equal(first.included.length, 1);
assert.equal(first.included[0].word, "밤");
assert.equal(first.included[0].sample, 3);
assert.equal(first.excluded.length, 1);
assert.equal(first.excluded[0].word, "파도");
assert.equal(first.excluded[0].sample, 2, "감정 없는 곡은 표본으로 세지 않는다");
console.log("✓ 모티프 어휘 × 감정 — 현재 번역 기반 결정적 계산·표본 제외");
