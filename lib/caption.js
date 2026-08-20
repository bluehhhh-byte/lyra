// Instagram caption for a lyric-card post — one line, space-separated. Pure +
// `now` injectable so the test can pin the timestamp. Timezone-local on purpose:
// the stamp reflects the poster's clock.
//
//   | 가수 - 제목 (발매년도) #가수 #음악로그 #YYMMDD_HHMM
export function buildCaption(song, now = new Date()) {
  const stamp = buildStamp(now);
  const tag = instagramTag(song.artist);
  const head = `${song.artist} - ${song.title}${song.year ? ` (${song.year})` : ""}`;
  return `| ${head} #${tag} #음악로그 #${stamp}`;
}

export function buildMovieCaption(movie, now = new Date()) {
  const stamp = buildStamp(now);
  const tag = instagramTag(movie.director);
  const head = `${movie.director} - ${movie.title}${movie.year ? ` (${movie.year})` : ""}`;
  return `| ${head} #${tag} #영화로그 #${stamp}`;
}

function buildStamp(now) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `_${p(now.getHours())}${p(now.getMinutes())}`
  );
}

function instagramTag(value = "") {
  // Instagram cuts a hashtag at the first space/punctuation — keep only letters
  // and digits (Korean/Japanese/Latin) so the whole name stays in one tag.
  return value.replace(/[^\p{L}\p{N}]/gu, "");
}

// 캐러셀 캡션 — 한 장짜리와 다른 글이 필요하다.
//
// 첫 줄에 후크를 반복한다: 카드를 누르지 않아도 피드에서 읽히게 하기 위해서다.
// 해시태그는 2025년 12월부터 게시물당 5개로 제한됐고, Mosseri가 도달을 늘리지
// 못한다고 직접 밝혔다 — 분류용이므로 정확히 5개만, 검색되는 것으로 채운다.
// (한 장짜리 캡션의 타임스탬프 태그는 검색되지 않아 여기서는 빼고 본문에 남긴다.)
export function buildCarouselCaption(song, hook, now = new Date()) {
  const stamp = buildStamp(now);
  const head = `${song.artist} — ${song.title}${song.year ? ` (${song.year})` : ""}`;
  const tags = carouselTags(song);
  return [
    hook ? `"${hook}"` : "",
    "",
    head,
    song.comment ? song.comment : "",
    "",
    "전문과 번역은 프로필 링크에.",
    "",
    tags.map((t) => `#${t}`).join(" "),
    `#${stamp}`,
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === "")) // 빈 줄이 겹치지 않게
    .join("\n")
    .trim();
}

// 아티스트 · 곡 · 장르 · 국적 · 감정 순으로 5개를 채운다. 앞에서부터 구체적이고
// 뒤로 갈수록 넓다 — 좁은 태그는 도달이 적고 넓은 태그만 쓰면 묻힌다.
function carouselTags(song) {
  const country = { 한국: "한국인디", 일본: "제이팝", 영미: "팝송" };
  const tags = [instagramTag(song.artist), instagramTag(song.title)];
  const genre = (song.tags || []).find((t) => /rock|pop|indie|folk|jazz|hip|metal|soul|r&b|punk/i.test(t));
  const nation = (song.tags || []).find((t) => country[t]);
  if (genre) tags.push(instagramTag(genre));
  if (nation) tags.push(country[nation]);
  tags.push("가사");
  if (song.emotion) tags.push(instagramTag(song.emotion));
  return [...new Set(tags.filter(Boolean))].slice(0, 5);
}
