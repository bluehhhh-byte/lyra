// Instagram caption for a lyric-card post — one line, space-separated. Pure +
// `now` injectable so the test can pin the timestamp. Timezone-local on purpose:
// the stamp reflects the poster's clock.
//
//   | 가수 - 제목 (발매년도) #가수 #YYMMDD_HHMM #음악로그
export function buildCaption(song, now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const stamp =
    `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `_${p(now.getHours())}${p(now.getMinutes())}`;
  // Instagram cuts a hashtag at the first space/punctuation — keep only letters
  // and digits (Korean/Japanese/Latin) so the whole artist name stays in one tag.
  const tag = (song.artist || "").replace(/[^\p{L}\p{N}]/gu, "");
  const head = `${song.artist} - ${song.title}${song.year ? ` (${song.year})` : ""}`;
  return `| ${head} #${tag} #${stamp} #음악로그`;
}
