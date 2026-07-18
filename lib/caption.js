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
