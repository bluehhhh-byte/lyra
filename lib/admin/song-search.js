const FIELD_WEIGHTS = Object.freeze({
  title: 400,
  titleKo: 390,
  aliases: 350,
  artist: 200,
  artistKo: 190,
  album: 100,
  slug: 50,
  tags: 20,
});
const SEARCH_FIELD_CACHE = new WeakMap();

const asList = (value) => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
};

// NFKC로 전각 영문·숫자를 합치고 문장부호를 공백으로 바꾼다. 라틴 문자만
// 악센트를 접어 Beyoncé/beyonce를 같게 보되, 일본어 탁점은 보존한다.
const foldLatinDiacritics = (value) =>
  Array.from(value).map((character) => {
    const decomposed = character.normalize("NFKD");
    return /^\p{Script=Latin}/u.test(decomposed)
      ? decomposed.replace(/\p{M}/gu, "")
      : decomposed;
  }).join("").normalize("NFC");

export function normalizeSongSearch(value) {
  return foldLatinDiacritics(String(value || "").normalize("NFKC").toLocaleLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function songSearchFields(song = {}) {
  if (song && typeof song === "object" && SEARCH_FIELD_CACHE.has(song))
    return SEARCH_FIELD_CACHE.get(song);
  const fields = [
    ["title", song.title],
    ["titleKo", song.title_ko],
    ...[...asList(song.searchAliases), ...asList(song.search_aliases)].map((alias) => ["aliases", alias]),
    ["artist", song.artist],
    ["artistKo", song.artist_ko],
    ["album", song.album],
    ["slug", song.slug],
    ...asList(song.tags).map((tag) => ["tags", tag]),
  ].map(([kind, value]) => ({ kind, value: normalizeSongSearch(value) }))
    .filter((field) => field.value);
  if (song && typeof song === "object") SEARCH_FIELD_CACHE.set(song, fields);
  return fields;
}

function editDistanceWithin(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    let rowMinimum = current[0];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      rowMinimum = Math.min(rowMinimum, current[j]);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }
  return previous[right.length];
}

function fieldMatchScore(field, term, allowFuzzy) {
  const value = field.value;
  const compactValue = value.replace(/ /g, "");
  const compactTerm = term.replace(/ /g, "");
  const words = value.split(" ");
  let strength = 0;

  if (value === term) strength = 500;
  else if (compactValue === compactTerm) strength = 470;
  else if (value.startsWith(term)) strength = 350;
  else if (words.includes(term)) strength = 330;
  else if (value.includes(term)) strength = 200;
  else if (compactValue.includes(compactTerm)) strength = 180;
  else if (allowFuzzy && compactTerm.length >= 4) {
    const maximum = compactTerm.length >= 10 ? 2 : 1;
    const candidates = [compactValue, ...words].filter((candidate) =>
      Math.abs(candidate.length - compactTerm.length) <= maximum
    );
    const distance = candidates.reduce(
      (best, candidate) => Math.min(best, editDistanceWithin(candidate, compactTerm, maximum)),
      maximum + 1
    );
    if (distance <= maximum) strength = 70 - distance * 15;
  }

  return strength ? strength + FIELD_WEIGHTS[field.kind] : 0;
}

export function songSearchScore(song, query, { allowFuzzy = true } = {}) {
  const normalizedQuery = normalizeSongSearch(query);
  const terms = normalizedQuery.split(" ").filter(Boolean);
  if (!terms.length) return 0;
  const fields = songSearchFields(song);
  let score = 0;

  for (const term of terms) {
    const best = fields.reduce(
      (maximum, field) => Math.max(maximum, fieldMatchScore(field, term, allowFuzzy)),
      0
    );
    if (!best) return -1;
    score += best;
  }

  // 여러 단어로 된 제목·아티스트를 통째로 검색했을 때 토큰별 우연 일치보다 앞선다.
  const whole = fields.reduce((maximum, field) => {
    if (field.value !== normalizedQuery) return maximum;
    return Math.max(maximum, 1000 + FIELD_WEIGHTS[field.kind]);
  }, 0);
  return score + whole;
}

export function filterAdminSongs(songs, query) {
  if (!normalizeSongSearch(query)) return songs;
  const rank = (allowFuzzy) => songs.map((song, index) => ({
    song,
    index,
    score: songSearchScore(song, query, { allowFuzzy }),
  }))
    .filter((result) => result.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((result) => result.song);
  const strict = rank(false);
  return strict.length ? strict : rank(true);
}
