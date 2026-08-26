// Instagram caption for a lyric-card post — one line, space-separated. Pure +
// `now` injectable so the test can pin the timestamp. Timezone-local on purpose:
// the stamp reflects the poster's clock.
//
//   | 가수 - 제목 (발매년도) #가수 #가사 #YYMMDD_HHMM
export const INSTAGRAM_CAPTION_LIMIT = 2200;
export const INSTAGRAM_HASHTAG_LIMIT = 30;

export function captionPreview(value) {
  const text = String(value || "").replace(/\r\n?/g, "\n");
  const characters = [...text].length;
  const lines = text ? text.split("\n").length : 0;
  const hashtags = (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
  const warnings = [];
  if (characters > INSTAGRAM_CAPTION_LIMIT)
    warnings.push(`Instagram 캡션 제한을 ${characters - INSTAGRAM_CAPTION_LIMIT}자 초과했습니다.`);
  if (hashtags > INSTAGRAM_HASHTAG_LIMIT)
    warnings.push(`Instagram 해시태그 제한을 ${hashtags - INSTAGRAM_HASHTAG_LIMIT}개 초과했습니다.`);
  return { text, characters, lines, hashtags, warnings };
}

export function buildCaption(song, now = new Date(), extraTags = []) {
  const stamp = buildStamp(now);
  const tag = instagramTag(song.artist);
  const head = `${song.artist} - ${song.title}${song.year ? ` (${song.year})` : ""}`;
  return `| ${head} ${captionTags([tag, "가사", ...extraTags, stamp])}`;
}

export function buildMovieCaption(movie, now = new Date(), extraTags = []) {
  const stamp = buildStamp(now);
  const tag = instagramTag(movie.director);
  const head = `${movie.director} - ${movie.title}${movie.year ? ` (${movie.year})` : ""}`;
  return `| ${head} ${captionTags([tag, "영화로그", ...extraTags, stamp])}`;
}

export function buildMovieCarouselCaption(preset, now = new Date(), extraTags = []) {
  const stamp = buildStamp(now);
  return `| ${preset.headline} ${captionTags(["Cyno", "영화로그", ...extraTags, stamp])}`;
}

export function hashtagSetsFor(dataset = {}, kind) {
  return (dataset.sets || [])
    .filter((set) => set?.id && set?.label && set?.kind === kind)
    .map((set) => ({
      id: String(set.id),
      label: String(set.label),
      tags: [...new Set((set.tags || []).map(instagramTag).filter(Boolean))],
    }));
}

function captionTags(tags) {
  return [...new Set(tags.map(instagramTag).filter(Boolean))].map((tag) => `#${tag}`).join(" ");
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
  return value.replace(/[^\p{L}\p{N}_]/gu, "");
}
