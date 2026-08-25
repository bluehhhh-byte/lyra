// 같은 원문이 한 곡 안에서 서로 다른 번역으로 반복되는지 판정하는 한 곳.
// 의도한 문맥 변주일 수 있으므로 결과는 알림과 린트에만 쓰고 자동 수정하지 않는다.
export function translationVariants(lines) {
  const byOriginal = new Map();
  for (const line of lines || []) {
    const original = line.en?.trim();
    const translation = line.ko?.trim();
    if (!original || !translation) continue;
    if (!byOriginal.has(original)) byOriginal.set(original, new Set());
    byOriginal.get(original).add(translation);
  }

  return [...byOriginal]
    .filter(([, translations]) => translations.size > 1)
    .map(([original, translations]) => ({ original, translations: [...translations] }));
}
