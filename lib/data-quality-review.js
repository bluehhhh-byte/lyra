const reviewKey = (slug, original) => `${slug}\u0000${original}`;

export function buildTranslationReviewIndex(snapshot = {}) {
  return {
    contextVariants: new Set((snapshot.records || [])
      .filter((item) => item.category === "context_justified")
      .map((item) => item.id)),
    retainedEchoes: new Set((snapshot.echoReview || [])
      .filter((item) => item.decision === "retain")
      .map((item) => reviewKey(item.slug, item.original))),
  };
}

export function unresolvedTranslationVariants(slug, variants = [], reviewIndex) {
  const reviewed = reviewIndex?.contextVariants || new Set();
  return variants.filter((item) => !reviewed.has(reviewKey(slug, item.original)));
}

export function unreviewedEchoLines(slug, lines = [], reviewIndex) {
  const reviewed = reviewIndex?.retainedEchoes || new Set();
  return lines.filter((line) => {
    const original = line.en?.trim();
    const translation = line.ko?.trim();
    return original && original === translation && !reviewed.has(reviewKey(slug, original));
  });
}

// 가사 자체가 없는 것으로 확인된 곡에는 가사 감정·핵심어를 억지로 만들지 않는다.
export const needsLyricMetadata = (song = {}) => !song.instrumental && !song.lyrics_none;
