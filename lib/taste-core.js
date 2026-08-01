// 취향 집계 — 취향 페이지와 Gemini 리포트가 같은 숫자를 쓰도록 공유.
// fs 없음(순수 함수) → lib/taste.test.mjs 가 브라우저·Next 없이 돌린다.

// 관람 편수(n)와 평균 별점(avg)을 그룹별로. min표본 미달은 편애/기피 순위에서 뺀다.
export function aggregate(rated, keyFn, { min = 3, top = 8 } = {}) {
  const g = new Map();
  for (const m of rated) {
    for (const k of [].concat(keyFn(m)).filter(Boolean)) {
      if (!g.has(k)) g.set(k, { n: 0, sum: 0 });
      const e = g.get(k);
      e.n += 1;
      e.sum += m.rating;
    }
  }
  const rows = [...g.entries()].map(([k, e]) => ({ k, n: e.n, avg: e.sum / e.n }));
  return {
    byCount: [...rows].sort((a, b) => b.n - a.n).slice(0, top),
    byAvg: rows.filter((r) => r.n >= min).sort((a, b) => b.avg - a.avg).slice(0, top),
    byLow: rows.filter((r) => r.n >= min).sort((a, b) => a.avg - b.avg).slice(0, top),
  };
}

export const decadeOf = (y) => (y ? `${Math.floor(Number(y) / 10) * 10}s` : "미상");
export const runtimeBucket = (r) => {
  const n = Number(r);
  if (!n) return null;
  if (n < 90) return "~90분";
  if (n < 110) return "90–110분";
  if (n < 130) return "110–130분";
  if (n < 150) return "130–150분";
  return "150분+";
};

// Gemini 프롬프트용 압축 요약 — 원본 1000편이 아니라 집계된 숫자만 넘긴다.
export function summarizeTaste(rated) {
  const mean = rated.reduce((n, m) => n + m.rating, 0) / rated.length;
  const country = aggregate(rated, (m) => m.country);
  const genre = aggregate(rated, (m) => m.genre);
  const director = aggregate(rated, (m) => m.director_ko || m.director, { min: 2, top: 10 });
  const decade = aggregate(rated, (m) => decadeOf(m.year), { min: 3 });
  const runtime = aggregate(rated, (m) => runtimeBucket(m.runtime), { min: 3 });
  const fmt = (rows) => rows.map((r) => `${r.k}(${r.n}편,★${r.avg.toFixed(2)})`).join(", ");
  return {
    count: rated.length,
    mean: Number(mean.toFixed(2)),
    lines: [
      `평가 ${rated.length}편, 전체 평균 ★${mean.toFixed(2)}`,
      `국가 많이 본 순: ${fmt(country.byCount)}`,
      `국가 편애: ${fmt(country.byAvg.slice(0, 4))} / 박한: ${fmt(country.byLow.slice(0, 4))}`,
      `장르 많이 본 순: ${fmt(genre.byCount)}`,
      `장르 편애: ${fmt(genre.byAvg.slice(0, 5))} / 박한: ${fmt(genre.byLow.slice(0, 5))}`,
      `감독 편애: ${fmt(director.byAvg.slice(0, 6))}`,
      `연대: ${fmt(decade.byCount)} / 편애 ${fmt(decade.byAvg.slice(0, 3))}`,
      `상영시간: ${fmt(runtime.byCount)}`,
    ].join("\n"),
  };
}
