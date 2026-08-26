import { emotionCenter, moodType, MOOD_MIN_SAMPLE } from "./emotion-model.js";

const translatedText = (song) =>
  (song.stanzas || []).flatMap((stanza) => stanza.lines || []).map((line) => String(line.ko || "")).join("\n");

// motifs.json의 설명이나 인용을 통계값으로 쓰지 않고, 현재 번역 가사에서 각 어휘가
// 실제 등장하는 곡을 다시 찾는다. 입력이 같으면 결과와 정렬도 언제나 같다.
export function motifEmotionProfiles(motifs, songs, minSample = MOOD_MIN_SAMPLE) {
  const words = [...new Set((motifs || []).flatMap((motif) => motif.keywords || []).map((word) => String(word).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ko"));
  const searchable = songs.map((song) => ({ song, text: translatedText(song) }));
  const all = words.map((word) => {
    const matched = searchable.filter(({ text }) => text.includes(word)).map(({ song }) => song);
    const center = emotionCenter(matched.map((song) => song.emotion));
    const sample = center?.n || 0;
    return {
      word,
      songCount: matched.length,
      sample,
      center,
      type: sample >= minSample ? moodType(center) : "판단 유보",
      included: sample >= minSample,
    };
  });
  const order = (a, b) => b.sample - a.sample || b.songCount - a.songCount || a.word.localeCompare(b.word, "ko");
  return {
    included: all.filter((row) => row.included).sort(order),
    excluded: all.filter((row) => !row.included).sort(order),
    minSample,
  };
}
