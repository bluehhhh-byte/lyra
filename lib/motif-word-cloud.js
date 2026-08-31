const stableHash = (word) => [...String(word)].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 2166136261);

export function motifWordCloud(rows) {
  if (!rows?.length) return [];
  const counts = rows.map((row) => row.count);
  const min = Math.log1p(Math.min(...counts));
  const max = Math.log1p(Math.max(...counts));
  const span = Math.max(max - min, 1);

  return rows
    .map((row, rank) => ({
      ...row,
      rank: rank + 1,
      // 로그 척도는 1위가 나머지를 압도하지 않으면서도 빈도 차이를 분명히 보인다.
      fontSize: Math.round(13 + ((Math.log1p(row.count) - min) / span) * 29),
      cloudOrder: stableHash(row.word),
    }))
    .sort((a, b) => a.cloudOrder - b.cloudOrder || a.rank - b.rank);
}
