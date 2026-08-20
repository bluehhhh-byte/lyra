const unique = (values) => [...new Set(values.filter(Boolean))];
const decade = (year) => year ? Math.floor(Number(year) / 10) * 10 : null;
const regionOf = (item, countries) => [].concat(item.tags || []).find((tag) => countries.includes(tag)) || item.country || "";
const common = (a, b) => [...a].filter((value) => b.has(value));

export function crossMatches(source, candidates, { countries = [], limit = 4 } = {}) {
  const sourceDecade = decade(source.year);
  if (!sourceDecade) return [];
  const sourceRegion = regionOf(source, countries);
  const sourceTerms = new Set(unique([source.emotion, ...(source.keywords || []), ...(source.themes || []), ...(source.tags || [])]));

  return candidates
    .filter((candidate) => decade(candidate.year) === sourceDecade)
    .map((candidate, index) => {
      const candidateRegion = regionOf(candidate, countries);
      const candidateTerms = new Set(unique([candidate.emotion, ...(candidate.keywords || []), ...(candidate.themes || []), ...(candidate.tags || [])]));
      const shared = common(sourceTerms, candidateTerms).filter((term) => term !== sourceRegion && !/^\d{4}$/.test(String(term)));
      const sameRegion = Boolean(sourceRegion && sourceRegion === candidateRegion);
      const score = 10 + (sameRegion ? 5 : 0) + shared.length * 3;
      const reason = unique([`${sourceDecade}년대`, sameRegion ? sourceRegion : "", ...shared.slice(0, 2)]).join(" · ");
      return { ...candidate, crossReason: reason, _crossScore: score, _crossIndex: index };
    })
    .sort((a, b) => b._crossScore - a._crossScore || a._crossIndex - b._crossIndex)
    .slice(0, limit)
    .map(({ _crossScore, _crossIndex, ...candidate }) => candidate);
}
